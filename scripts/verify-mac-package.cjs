// Verify the archive users receive, including resource seals and a real tamper check.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const asar = require('@electron/asar');

if (process.platform !== 'darwin') throw new Error('Mac signature verification requires macOS.');
const archive = path.resolve(process.argv[2] || 'release/CarCrow-Mac-Apple-Silicon.zip');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'carcrow-signature-'));
const app = path.join(fixture, 'CarCrow.app');
const version = require('../package.json').version;
const report = { version, startedAt: new Date().toISOString(), status: 'running', checks: [] };
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 120000 });
try {
  run('/usr/bin/ditto', ['-xk', archive, fixture]);
  const bundleId = run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', path.join(app, 'Contents/Info.plist')]).trim();
  assert.equal(bundleId, 'se.carcrow.desktop');
  assert.equal(run('/usr/bin/lipo', ['-archs', path.join(app, 'Contents/MacOS/CarCrow')]).trim(), 'arm64');
  const appAsar = path.join(app, 'Contents/Resources/app.asar');
  assert.equal(JSON.parse(asar.extractFile(appAsar, 'package.json')).version, version);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  report.checks.push('public archive contains the correct Apple Silicon app and version', 'complete bundle and nested code pass strict signature verification');
  // codesign writes display metadata to stderr.
  const display = spawnSync('/usr/bin/codesign', ['--display', '--verbose=4', app], { encoding: 'utf8' });
  if (display.status !== 0) throw new Error('Cannot inspect signature.');
  assert.match(display.stderr, /Identifier=se\.carcrow\.desktop(?:\r?\n|$)/);
  assert.doesNotMatch(display.stderr, /Sealed Resources=none|Info\.plist=not bound/);
  assert.match(display.stderr, /flags=.*runtime/);
  report.signing = display.stderr.includes('Signature=adhoc') ? 'ad-hoc' : 'certificate';
  report.appleNotarization = 'not configured; macOS may require user approval on first launch';
  if (process.argv.includes('--require-notarization')) {
    run('/usr/sbin/spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
    run('/usr/bin/xcrun', ['stapler', 'validate', app]);
    report.appleNotarization = 'verified';
    report.checks.push('Gatekeeper accepts the app and its stapled notarization ticket');
  }
  const quarantine = '0083;' + Math.floor(Date.now() / 1000).toString(16) + ';Safari;' + require('node:crypto').randomUUID();
  run('/usr/bin/xattr', ['-w', 'com.apple.quarantine', quarantine, app]);
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  report.checks.push('browser-style quarantine metadata preserves the valid bundle signature');
  const fd = fs.openSync(appAsar, 'r+');
  try {
    const at = fs.fstatSync(fd).size - 1, byte = Buffer.alloc(1);
    fs.readSync(fd, byte, 0, 1, at); byte[0] ^= 1;
    fs.writeSync(fd, byte, 0, 1, at);
  } finally { fs.closeSync(fd); }
  assert.throws(() => run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]), 'Modified application resources must invalidate the signature.');
  report.checks.push('a modified app.asar is rejected by the code signature');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error.stderr || error.message).slice(0, 4000);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  fs.mkdirSync(path.resolve('test-results'), { recursive: true });
  fs.writeFileSync(path.resolve('test-results/mac-signature.json'), JSON.stringify(report, null, 2));
  fs.rmSync(fixture, { recursive: true, force: true });
  console.log(JSON.stringify(report));
}

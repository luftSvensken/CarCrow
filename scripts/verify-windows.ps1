param([switch]$InstallOnEphemeralRunner, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'Denna kontroll ska köras på Windows.' }
if ($InstallOnEphemeralRunner -and $env:GITHUB_ACTIONS -ne 'true') {
    throw 'Installationstestet kräver en tillfällig GitHub Actions-runner. Använd standardkontrollen på en vanlig dator.'
}
Set-Location (Split-Path $PSScriptRoot -Parent)
if (-not $SkipBuild) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci misslyckades' }
    npm test
    if ($LASTEXITCODE -ne 0) { throw 'Datatester misslyckades' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Bygget misslyckades' }
    npx electron-builder --publish never --win zip nsis --x64 --config.nsis.artifactName=CarCrow-Windows-Setup.exe
    if ($LASTEXITCODE -ne 0) { throw 'Paketeringen misslyckades' }
}
$env:CARCROW_EXECUTABLE = Join-Path (Get-Location) 'release\win-unpacked\CarCrow.exe'
$env:CARCROW_SCREENSHOTS = Join-Path (Get-Location) 'test-results\portable'
node scripts/smoke.cjs
if ($LASTEXITCODE -ne 0) { throw 'Den första gränssnittskontrollen misslyckades' }
node scripts/smoke06.cjs
if ($LASTEXITCODE -ne 0) { throw 'Gränssnittskontrollen av det portabla paketet misslyckades' }
if ($InstallOnEphemeralRunner) {
    $installDirectory = Join-Path $env:RUNNER_TEMP ('carcrow-install-' + [guid]::NewGuid().ToString('N'))
    $installer = Join-Path (Get-Location) 'release\CarCrow-Windows-Setup.exe'
    # NSIS kräver /D sist och utan citattecken. Den assisterade installationen startar inte appen i /S-läge.
    $process = Start-Process -FilePath $installer -ArgumentList "/currentuser /S /D=$installDirectory" -PassThru
    if (-not $process.WaitForExit(240000)) {
        $process.Kill()
        throw 'Installationstestet tog mer än fyra minuter.'
    }
    if ($process.ExitCode -ne 0) { throw "Installationen misslyckades: $($process.ExitCode)" }
    $env:CARCROW_EXECUTABLE = Join-Path $installDirectory 'CarCrow.exe'
    if (-not (Test-Path -LiteralPath $env:CARCROW_EXECUTABLE)) { throw 'Den installerade appen saknas.' }
    $env:CARCROW_SCREENSHOTS = Join-Path (Get-Location) 'test-results\installed'
    node scripts/smoke.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Den första gränssnittskontrollen misslyckades' }
    node scripts/smoke06.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Gränssnittskontrollen av den installerade appen misslyckades' }
    $env:CARCROW_AUTOMATIC_UPDATE = '1'
    node scripts/update-install.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Uppdateringen eller databevarandet misslyckades' }
    @{
        status = 'passed'
        installerExitCode = $process.ExitCode
        installedExecutableFound = $true
        completedAt = (Get-Date).ToUniversalTime().ToString('o')
    } | ConvertTo-Json | Set-Content -Encoding utf8 'test-results\installation.json'
    Write-Host 'Windows-installation, portabel app, installerad app och låst AI-konfiguration är verifierade.'
} else {
    Write-Host 'Det portabla Windows-paketet är verifierat. Installation testas separat på en tillfällig runner.'
}

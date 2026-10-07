const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {Updater,assetName}=require('../electron/updater.cjs');
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'carcrow-auto-')),bytes=Buffer.alloc(1024,71),sha=crypto.createHash('sha256').update(bytes).digest('hex'),release={tag_name:'v0.6.0',draft:false,prerelease:false,assets:[{name:assetName(process.platform,process.arch),size:bytes.length,digest:'sha256:'+sha,browser_download_url:'https://github.com/luftSvensken/CarCrow/releases/download/v0.6.0/CarCrow.zip'}]};return {root,bytes,release};}
test('automatic updates stage a verified package, reuse it after restart, and install without another download',async()=>{
 const {root,bytes,release}=fixture();let downloads=0,quit=0,prepared=0;const options={app:{getPath:()=>root,getVersion:()=> '0.5.0',isPackaged:true,quit:()=>quit++},request:async()=>release,downloadFile:async(_url,file)=>{downloads++;fs.writeFileSync(file,bytes);}};
 try{let u=new Updater(options);assert.equal((await u.automatic()).status,'ready');assert.equal(quit,0);assert.equal(downloads,1);u=new Updater(options);assert.equal((await u.automatic()).status,'ready');assert.equal(downloads,1);u.prepareMac=u.prepareWindows=async()=>prepared++;await u.install({quitAfter:true});assert.equal(prepared,1);assert.equal(quit,1);assert.equal(downloads,1);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('a corrupted staged package is downloaded again and corrupted downloads never become installable',async()=>{
 const {root,bytes,release}=fixture();let downloads=0;const u=new Updater({app:{getPath:()=>root,getVersion:()=> '0.5.0'},request:async()=>release,downloadFile:async(_url,file)=>{downloads++;fs.writeFileSync(file,downloads<3?bytes:Buffer.alloc(1024,99));}});
 try{await u.automatic();fs.writeFileSync(u.staged.file,Buffer.alloc(1024,99));await u.automatic();assert.equal(downloads,2);fs.rmSync(u.staged.file);await assert.rejects(u.automatic(),/kontrollsumma/);assert.equal(u.ready(),false);assert.equal(u.state.status,'error');assert.equal(fs.existsSync(u.staged.file+'.part'),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('automatic update discovery never stages a downgrade or a release without a verified digest',async()=>{
 const {root,release}=fixture();let downloads=0;const u=new Updater({app:{getPath:()=>root,getVersion:()=> '0.5.0'},request:async()=>release,downloadFile:async()=>downloads++});
 try{release.tag_name='v0.4.0';assert.equal((await u.automatic()).status,'current');release.tag_name='v0.6.0';delete release.assets[0].digest;assert.equal((await u.automatic()).status,'error');assert.equal(downloads,0);assert.equal(u.ready(),false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});

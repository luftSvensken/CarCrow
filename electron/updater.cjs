const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),https=require('node:https'),dns=require('node:dns').promises,{spawn,execFile}=require('node:child_process');
const {privateIP,requestJSON}=require('./services.cjs');
const REPO='luftSvensken/CarCrow';
function newer(a,b){if(!/^\d+\.\d+\.\d+$/.test(a)||!/^\d+\.\d+\.\d+$/.test(b))return false;const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<3;i++)if(x[i]!==y[i])return x[i]>y[i];return false;}
function assetName(platform,arch){return platform==='darwin'?(arch==='arm64'?'CarCrow-Mac-Apple-Silicon.zip':'CarCrow-Mac-Intel.zip'):platform==='win32'&&arch==='x64'?'CarCrow-Windows-Setup.exe':null;}
function digest(asset){const value=asset.digest||'';if(!/^sha256:[a-f0-9]{64}$/.test(value))throw new Error('Uppdateringen saknar en verifierbar kontrollsumma från GitHub.');return value.slice(7);}
function safeDownloadURL(url){const u=new URL(url);if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!(u.hostname==='github.com'||u.hostname==='api.github.com'||u.hostname.endsWith('.githubusercontent.com')))throw new Error('Ogiltig uppdateringsadress.');return u;}
async function download(url,file,{size,sha256,signal,progress=()=>{}}={},redirects=0){
 const u=safeDownloadURL(url);if(redirects>5)throw new Error('För många omdirigeringar.');const addresses=await dns.lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(a=>privateIP(a.address)))throw new Error('Ogiltig uppdateringsserver.');const chosen=addresses.find(a=>a.family===4)||addresses[0];
 return new Promise((resolve,reject)=>{let output,received=0,last=0;const hash=crypto.createHash('sha256');const req=https.get(u,{headers:{'User-Agent':'CarCrow/0.4','Accept':'application/octet-stream'},lookup:(_h,o,cb)=>o?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
  if([301,302,303,307,308].includes(res.statusCode)){res.resume();if(!res.headers.location){reject(new Error('Uppdateringslänken saknas.'));return;}download(new URL(res.headers.location,u).href,file,{size,sha256,signal,progress},redirects+1).then(resolve,reject);return;}
  if(res.statusCode!==200){res.resume();reject(new Error('Uppdateringen kunde inte hämtas (HTTP '+res.statusCode+').'));return;}
  output=fs.createWriteStream(file,{flags:'w',mode:0o600});output.on('error',e=>req.destroy(e));res.on('data',chunk=>{received+=chunk.length;if(received>size){req.destroy(new Error('Uppdateringsfilens storlek stämmer inte.'));return;}hash.update(chunk);if(Date.now()-last>150){last=Date.now();progress(Math.round(received/size*100));}});res.on('error',e=>req.destroy(e));res.pipe(output);output.on('finish',()=>{if(received!==size||hash.digest('hex')!==sha256){reject(new Error('Uppdateringens kontrollsumma stämmer inte. Filen installerades inte.'));return;}progress(100);resolve();});
 });req.on('error',e=>{output?.destroy();reject(e);});req.setTimeout(45000,()=>req.destroy(new Error('Hämtningen av uppdateringen tog för lång tid.')));const abort=()=>{const e=new Error('Hämtningen avbröts.');e.name='AbortError';req.destroy(e);};signal?.addEventListener('abort',abort,{once:true});req.once('close',()=>signal?.removeEventListener('abort',abort));if(signal?.aborted)abort();});
}
const run=(command,args)=>new Promise((resolve,reject)=>execFile(command,args,(e,out)=>e?reject(e):resolve(out)));
class Updater {
 constructor({app,changed=()=>{},request=requestJSON,downloadFile=download}){Object.assign(this,{app,changed,request,downloadFile});this.root=path.join(app.getPath('userData'),'updates');this.state={current:app.getVersion(),status:'idle',progress:0};this.release=null;this.controller=null;try{const result=JSON.parse(fs.readFileSync(path.join(this.root,'result.json'),'utf8'));if(!result.ok){this.state.status='error';this.state.error=result.error||'Uppdateringen misslyckades; den tidigare appen har återställts.';}fs.rmSync(path.join(this.root,'result.json'),{force:true});}catch{}}
 public(){return {...this.state,repository:'https://github.com/'+REPO};}
 update(value){Object.assign(this.state,value);this.changed();}
 async check(){if(this.controller)return this.public();this.update({status:'checking',error:null});try{const release=await this.request('https://api.github.com/repos/'+REPO+'/releases/latest',{headers:{Accept:'application/vnd.github+json'},timeout:15000});const version=String(release.tag_name||'').replace(/^v/,'');if(release.draft||release.prerelease||!newer(version,this.app.getVersion())){this.update({status:'current',latest:null});return this.public();}const asset=release.assets?.find(a=>a.name===assetName(process.platform,process.arch));if(!asset||!Number.isSafeInteger(asset.size)||asset.size<1000||asset.size>1024*1024*1024)throw new Error('Ingen kompatibel uppdatering hittades.');const sha256=digest(asset);safeDownloadURL(asset.browser_download_url);this.release={version,asset,sha256};this.update({status:'available',latest:version,notes:String(release.body||'').slice(0,2000)});}catch(e){this.update(e.status===404?{status:'current',latest:null}:{status:'error',error:e.message});}return this.public();}
 cancel(){this.controller?.abort();}
 async install(){
  if(this.controller)throw new Error('En uppdatering hämtas redan.');if(!this.release||!newer(this.release.version,this.app.getVersion()))throw new Error('Kontrollera först om det finns en ny version.');
  const {version,asset,sha256}=this.release;fs.mkdirSync(this.root,{recursive:true,mode:0o700});const file=path.join(this.root,asset.name+'.part');this.controller=new AbortController();this.update({status:'downloading',progress:0,error:null});
  try{await this.downloadFile(asset.browser_download_url,file,{size:asset.size,sha256,signal:this.controller.signal,progress:progress=>this.update({progress})});this.update({status:'installing'});
   if(process.platform==='darwin')await this.prepareMac(file,version);else if(process.platform==='win32')await this.prepareWindows(file);else throw new Error('Automatisk installation stöds inte på den här datorn.');this.app.quit();return true;
  }catch(e){fs.rmSync(file,{force:true});this.update({status:e.name==='AbortError'?'available':'error',error:e.name==='AbortError'?null:e.message});throw e;}finally{this.controller=null;}
 }
 async prepareMac(file,version){
  if(!this.app.isPackaged)throw new Error('Installera uppdateringen i den installerade CarCrow-appen.');
  const target=path.resolve(process.execPath,'../../..');if(!target.endsWith('/CarCrow.app'))throw new Error('Appens installationsplats kunde inte verifieras.');try{fs.accessSync(path.dirname(target),fs.constants.W_OK);}catch{throw new Error('Flytta CarCrow till Program i din hemmapp och försök igen.');}
  const stage=fs.mkdtempSync(path.join(this.root,'stage-'));await run('/usr/bin/ditto',['-x','-k',file,stage]);const source=path.join(stage,'CarCrow.app');const meta=path.join(source,'Contents/Info.plist');
  const id=String(await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleIdentifier',meta])).trim(),built=String(await run('/usr/libexec/PlistBuddy',['-c','Print :CFBundleShortVersionString',meta])).trim();if(id!=='se.carcrow.desktop'||built!==version)throw new Error('Uppdateringen innehåller fel app eller version.');
  const visit=dir=>{for(const name of fs.readdirSync(dir)){const f=path.join(dir,name),stat=fs.lstatSync(f);if(stat.isSymbolicLink()){const real=fs.realpathSync(f);if(!real.startsWith(source+path.sep))throw new Error('Uppdateringen innehåller en ogiltig fillänk.');}else if(stat.isDirectory())visit(f);}};visit(source);
  const incoming=path.join(path.dirname(target),'.CarCrow-next-'+crypto.randomUUID());fs.cpSync(source,incoming,{recursive:true,verbatimSymlinks:true});const config={pid:process.pid,target,incoming,backup:target+'.previous',ready:path.join(this.root,'ready'),result:path.join(this.root,'result.json'),nonce:crypto.randomUUID(),timeout:60000,stage,archive:file};fs.rmSync(config.ready,{force:true});const configFile=path.join(this.root,'install.json'),helper=path.join(this.root,'update-helper.cjs');fs.writeFileSync(configFile,JSON.stringify(config),{mode:0o600});fs.copyFileSync(path.join(__dirname,'update-helper.cjs'),helper);const child=spawn(process.execPath,[helper,configFile],{detached:true,stdio:'ignore',env:{...process.env,ELECTRON_RUN_AS_NODE:'1'}});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 }
 async prepareWindows(file){
  if(!this.app.isPackaged)throw new Error('Installera uppdateringen i den installerade CarCrow-appen.');const installer=path.join(this.root,'CarCrow-Update.exe');fs.renameSync(file,installer);const config={pid:process.pid,exe:process.execPath,installer,ready:path.join(this.root,'ready'),result:path.join(this.root,'result.json'),nonce:crypto.randomUUID(),timeout:60000};
  fs.rmSync(config.ready,{force:true});fs.writeFileSync(path.join(this.root,'install.json'),JSON.stringify(config),{mode:0o600});const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(windowsScript(config),'utf16le').toString('base64')],{detached:true,stdio:'ignore',windowsHide:true});await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});child.unref();
 }

 acknowledge(){const configFile=path.join(this.root,'install.json');if(!fs.existsSync(configFile))return;try{const config=JSON.parse(fs.readFileSync(configFile,'utf8'));const at=process.argv.indexOf('--carcrow-update-check');if(at>=0&&process.argv[at+1]===config.nonce){fs.writeFileSync(config.ready,config.nonce,{mode:0o600});fs.writeFileSync(path.join(this.root,'running.json'),JSON.stringify({pid:process.pid,version:this.app.getVersion()}),{mode:0o600});fs.rmSync(configFile,{force:true});}}catch{}}
}
module.exports={Updater,newer,assetName,digest,safeDownloadURL,download};

function windowsScript(c){
 const quote=s=>"'"+String(s).replaceAll("'","''")+"'",installPath=path.dirname(c.exe),backup=path.join(path.dirname(installPath),'.CarCrow-previous-'+c.nonce),failed=backup+'-failed';
 return `$ErrorActionPreference='Stop'
 $backupReady=$false;$newProcess=$null
 try {
  Wait-Process -Id ${c.pid} -Timeout 120 -ErrorAction SilentlyContinue
  if(Get-Process -Id ${c.pid} -ErrorAction SilentlyContinue){throw 'Appen stängdes inte.'}
  Copy-Item -LiteralPath ${quote(installPath)} -Destination ${quote(backup)} -Recurse
  $backupReady=$true
  $installerProcess=Start-Process -FilePath ${quote(c.installer)} -ArgumentList ${quote('/currentuser /S /D='+installPath)} -Wait -PassThru
  if($installerProcess.ExitCode -ne 0){throw 'Installationen av uppdateringen kunde inte slutföras.'}
  $newProcess=Start-Process -FilePath ${quote(c.exe)} -ArgumentList ${quote('--carcrow-update-check '+c.nonce)} -PassThru
  $started=Get-Date
  while(!(Test-Path -LiteralPath ${quote(c.ready)}) -or (Get-Content -LiteralPath ${quote(c.ready)} -Raw) -ne ${quote(c.nonce)}){
   if(((Get-Date)-$started).TotalMilliseconds -gt ${c.timeout}){throw 'Den nya appen kunde inte starta.'}
   Start-Sleep -Milliseconds 200
  }
  @{ok=$true} | ConvertTo-Json | Set-Content -LiteralPath ${quote(c.result)}
  Remove-Item -LiteralPath ${quote(backup)} -Recurse -Force
 } catch {
  $updateError=$_.Exception.Message
  if($newProcess){Get-CimInstance Win32_Process | Where-Object ParentProcessId -eq $newProcess.Id | ForEach-Object {Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue};Stop-Process -Id $newProcess.Id -Force -ErrorAction SilentlyContinue;Start-Sleep -Milliseconds 500}
  if($backupReady){if(Test-Path -LiteralPath ${quote(installPath)}){Move-Item -LiteralPath ${quote(installPath)} -Destination ${quote(failed)}};Move-Item -LiteralPath ${quote(backup)} -Destination ${quote(installPath)};Remove-Item -LiteralPath ${quote(failed)} -Recurse -Force -ErrorAction SilentlyContinue}
  @{ok=$false;error=$updateError} | ConvertTo-Json | Set-Content -LiteralPath ${quote(c.result)}
  if(Test-Path -LiteralPath ${quote(c.exe)}){Start-Process -FilePath ${quote(c.exe)}}
 }`;
}
module.exports.windowsScript=windowsScript;

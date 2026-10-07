const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 if(!['darwin','win32'].includes(process.platform)||(process.platform==='win32'&&process.env.GITHUB_ACTIONS!=='true'))throw new Error('Update test requires an isolated Mac copy or an ephemeral Windows runner.');
 let exe=process.env.CARCROW_EXECUTABLE;const installer=path.resolve(process.env.CARCROW_UPDATE_PACKAGE||'release/CarCrow-Windows-Setup.exe');if(!exe||!fs.existsSync(installer))throw new Error('Package missing');
 const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'carcrow-update-fixture-')),dataDir=path.join(fixture,'data'),root=path.join(dataDir,'updates');fs.mkdirSync(dataDir);let app,pid;const report={status:'running',platform:process.platform,checks:[],startedAt:new Date().toISOString()};
 if(process.platform==='darwin'){const source=path.resolve(exe,'../../..'),copy=path.join(fixture,'CarCrow.app');assert.ok(source.endsWith('/CarCrow.app'));fs.cpSync(source,copy,{recursive:true,verbatimSymlinks:true});exe=path.join(copy,'Contents/MacOS/CarCrow');}
 const launch=()=>electron.launch({executablePath:exe,args:[],env:{...process.env,CARCROW_TEST_DEMO:'1',CARCROW_DATA_DIR:dataDir},timeout:90000});
 try{
  app=await launch();const page=await app.firstWindow();await page.getByRole('heading',{name:'Vilken bil spanar du efter?'}).waitFor();
  const car=await page.evaluate(async()=>{const r=await window.carcrow.call('marketStart',{filters:{}});await window.carcrow.call('bookmark',{id:r.data.items[0].id});await window.carcrow.call('watch',{name:'Bevara min bevakning',filters:{makes:['BMW']}});await window.carcrow.call('settings',{theme:'dark'});return r.data.items[0].id;});
  const started=await page.evaluate(()=>window.carcrow.call('agentStart',{text:'Bevara min chatt'}));assert.equal(started.ok,true);await page.waitForTimeout(500);
  const version=await app.evaluate(({app})=>app.getVersion());
  await app.evaluate(async({app},{installer,version})=>{
   const requireModule=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/package.json');const path=requireModule('node:path'),fs=requireModule('node:fs'),{Updater}=requireModule(path.join(process.resourcesPath,'app.asar/electron/updater.cjs')); 
   const instance=new Updater({app:{isPackaged:true,getPath:n=>app.getPath(n),getVersion:()=> '0.0.1',quit:()=>app.quit()},downloadFile:async(_url,file)=>fs.copyFileSync(installer,file)});
   instance.release={version,asset:{name:path.basename(installer),browser_download_url:'https://github.com/fixture',size:fs.statSync(installer).size},sha256:'fixture'};
   await instance.install();
  },{installer,version}).catch(e=>{if(!/closed|destroyed|Target/.test(e.message))throw e;});
  app=null;const start=Date.now();while(!fs.existsSync(path.join(root,'result.json'))){if(Date.now()-start>180000)throw new Error('Update helper did not complete');await new Promise(r=>setTimeout(r,200));}
  const result=JSON.parse(fs.readFileSync(path.join(root,'result.json'),'utf8'));assert.equal(result.ok,true,result.error);
  pid=JSON.parse(fs.readFileSync(path.join(root,'running.json'),'utf8')).pid;process.kill(pid);pid=null;await new Promise(r=>setTimeout(r,1000));
  app=await launch();const updated=await app.firstWindow();await updated.getByRole('heading',{name:'Vilken bil spanar du efter?'}).waitFor();
  const state=await updated.evaluate(async()=>({boot:(await window.carcrow.call('bootstrap')).data,chats:(await window.carcrow.call('chats')).data,saved:(await window.carcrow.call('searchNext',{filters:{},saved:true})).data}));
  assert.equal(state.boot.version,version);assert.equal(state.boot.theme,'dark');assert.ok(state.boot.watches.some(w=>w.name==='Bevara min bevakning'));assert.ok(state.saved.items.some(c=>c.id===car));assert.ok(state.chats.some(c=>c.title==='Bevara min chatt'));report.checks.push(process.platform==='win32'?'actual NSIS update in the existing installation':'actual Mac app replacement in an isolated installation','replacement app acknowledges a successful React bootstrap','saved car, chat, watch and theme survive restart');report.status='passed';console.log(JSON.stringify(report));
 }catch(e){report.status='failed';report.error=e.message;report.helperLog=fs.existsSync(path.join(root,'helper.log'))?fs.readFileSync(path.join(root,'helper.log'),'utf8').slice(-12000):'No helper log';report.helperError=fs.existsSync(path.join(root,'helper-error.log'))?fs.readFileSync(path.join(root,'helper-error.log'),'utf8').slice(-12000):null;report.helperResult=fs.existsSync(path.join(root,'result.json'))?fs.readFileSync(path.join(root,'result.json'),'utf8'):null;console.error(JSON.stringify(report));throw e;}
 finally{report.finishedAt=new Date().toISOString();fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/update-install.json',JSON.stringify(report,null,2));if(app){await app.evaluate(({app})=>app.quit()).catch(()=>{});await app.close().catch(()=>{});}if(pid)try{process.kill(pid);}catch{}fs.rmSync(fixture,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});

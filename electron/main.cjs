const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,Menu,Tray,nativeImage,Notification}=require('electron');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Store,validateFilters,httpsURL}=require('./core.cjs');
const {requestJSON}=require('./services.cjs');
const {seedDemo}=require('./demo.cjs');
const {verifyKnown}=require('./blocket.cjs');
const {verifyHTMLSource}=require('./html-sources.cjs');
const {Market}=require('./market.cjs');const {CarAgent}=require('./agent.cjs');
let store,market,agent,win,tray,quitting=false,syncing=false,provisionedKey=null;
const sourceCatalog=[
  {id:'blocket',name:'Blocket',adapter:'blocket-public',hosts:['www.blocket.se','blocket.se'],docs:'https://blocket-api.se'},
  {id:'bytbil',name:'Bytbil',adapter:'public-html',hosts:['www.bytbil.com','bytbil.com'],docs:'https://www.bytbil.com'},
  {id:'wayke',name:'Wayke',adapter:'public-html',hosts:['www.wayke.se','wayke.se'],docs:'https://www.wayke.se/sok'},
  {id:'bilweb',name:'Bilweb',adapter:'public-html',hosts:['bilweb.se','www.bilweb.se'],docs:'https://bilweb.se'},
  {id:'kvd',name:'Kvdbil',hosts:['www.kvd.se','kvd.se'],docs:'https://www.kvd.se/kontakt'}
];
function secureEncrypt(text){if(!safeStorage.isEncryptionAvailable())throw new Error('Operativsystemets säkra nyckellagring är inte tillgänglig. Nyckeln sparades inte.');return safeStorage.encryptString(text).toString('base64');}
function secureDecrypt(text){if(!text)return null;if(!safeStorage.isEncryptionAvailable())throw new Error('Nyckellagringen är låst. Lås upp operativsystemets nyckellagring.');return safeStorage.decryptString(Buffer.from(text,'base64'));}
function aiKey(){return provisionedKey;}
function demoMode(){return !!store.setting('demo');}
function sourcePublic(s){return {...s,hasToken:!!store.setting('sourceToken:'+s.id)};}
function changed(){if(win&&!win.isDestroyed())win.webContents.send('carcrow:changed');}
async function sync(force=false){
  if(syncing||demoMode()||(!force&&agent?.active))return {busy:true};syncing=true;const results=[];
  try{
    store.purgeExpired();
    for(const source of store.sources().filter(s=>!s.demo&&s.enabled)){
      if(!force&&source.lastSync&&Date.now()-Date.parse(source.lastSync)<source.intervalMinutes*60000)continue;
      const attempted=store.setting('attempt:'+source.id);if(!force&&attempted&&Date.now()-attempted<300000)continue;store.setSetting('attempt:'+source.id,Date.now());
      try{
        store.checkSource(source);
        if(source.adapter){
          const options={sources:[source.id],onProgress:e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:market',e);}};
          // Refresh the newest ordinary page, then advance the persistent crawl.
          await market.next({sort:'newest'},{...options,fresh:true});
          const progress=await market.next({sort:'newest'},options);
          for(const watch of store.watches(false)){await market.next(watch.filters,{...options,fresh:true});await market.next(watch.filters,options);}
          const verification=source.adapter==='blocket-public'?await verifyKnown(store,source):await verifyHTMLSource(store,source);
          results.push({source:source.name,coverage:progress.coverage[source.id],verified:verification.checked,removed:verification.removed});
        }else{
          const token=secureDecrypt(store.setting('sourceToken:'+source.id)),payload=await requestJSON(source.feedURL,{headers:token?{Authorization:'Bearer '+token}:{}});
          results.push({source:source.name,...store.importSnapshot(source,payload)});store.sourceStatus(source.id,null,true);
        }
      }catch(e){store.sourceStatus(source.id,e.message);results.push({source:source.name,error:e.message});}
    }
    return {results};
  }finally{syncing=false;changed();}
}
async function dispatch(action,p={}){
  if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Ogiltig begäran.');
  const demo=demoMode();
  switch(action){
    case 'bootstrap':return {stats:{...store.stats(demo),aiConfigured:!!provisionedKey,model:'openrouter/free',coverage:demo?null:store.setting('blocketCoverage')},facets:store.facets(demo),demo,background:!!store.setting('background'),sources:store.sources().filter(s=>!s.demo).map(sourcePublic),watches:store.watches(demo),platform:process.platform};
    case 'chats':return agent.list();
    case 'chat':return agent.get(p.id);
    case 'chatDelete':agent.remove(p.id);changed();return true;
    case 'agentStart':return agent.start(p);
    case 'agentStop':agent.stop(p.runId);return true;
    case 'marketNext':{
      if(demo)return {...store.search(p.filters,true,p.page||0),filters:p.filters,hasMore:false};
      const result=await market.next(p.filters,{excludeIds:p.excludeIds||[],onProgress:e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:market',e);}});changed();return result;
    }
    case 'marketCoverage':return market.coverage(p.filters);
    case 'searchNext':{const r=store.search(p.filters,demo,0,!!p.saved,null,false,p.excludeIds||[]);return {...r,total:store.search(p.filters,demo,0,!!p.saved).total,remaining:r.total-r.items.length,filters:p.filters,hasMore:!!p.hasMore};}
    case 'search':{const result=store.search(p.filters,demo,p.page||0,!!p.saved,p.ids||null);if(p.compare)result.items=result.items.map(x=>({...x,comparison:store.comparison(x.id,demo)})).sort((a,b)=>(b.comparison.percentBelow??-Infinity)-(a.comparison.percentBelow??-Infinity));return result;}
    case 'detail':return store.detail(p.id,demo);
    case 'bookmark':{const saved=store.bookmark(p.id);changed();return saved;}
    case 'demo':store.setSetting('demo',!!p.enabled);if(p.enabled)seedDemo(store);changed();return true;
    case 'settings':{
      if(Object.hasOwn(p,'key')||Object.hasOwn(p,'model'))throw new Error('Appens AI-konfiguration är låst.');
      if(p.background!==undefined)store.setSetting('background',!!p.background);
      changed();return true;
    }
    case 'saveSource':{
      const id=p.id||crypto.randomUUID();const catalog=sourceCatalog.find(s=>s.id===id);const old=store.sources().find(s=>s.id===id);
      const s={id,name:catalog?.name||String(p.name||'Eget flöde').trim().slice(0,60),adapter:catalog?.adapter,hosts:catalog?.hosts||String(p.hosts||'').split(',').map(x=>x.trim()).filter(Boolean),docs:catalog?.docs||null,enabled:!!p.enabled,feedURL:catalog?.adapter?catalog.docs:p.feedURL?httpsURL(p.feedURL):'',approval:String(p.approval||'').trim().slice(0,300),approvedUntil:p.approvedUntil?new Date(p.approvedUntil+'T23:59:59Z').toISOString():null,mediaAllowed:catalog?.adapter?true:!!p.mediaAllowed,intervalMinutes:Number(p.intervalMinutes||60),retentionDays:Number(p.retentionDays||30)};
      if(s.intervalMinutes<15||s.intervalMinutes>1440||!Number.isInteger(s.intervalMinutes))throw new Error('Uppdateringsintervallet måste vara 15–1 440 minuter.');
      if(s.retentionDays<1||s.retentionDays>(id==='wayke'?90:365)||!Number.isInteger(s.retentionDays))throw new Error('Ogiltig lagringstid.');
      if(s.enabled){store.checkSource(s);if(!s.feedURL||!s.hosts.length)throw new Error('Ange flödets URL och godkända annonsdomäner.');}
      if(p.token?.trim())store.setSetting('sourceToken:'+id,secureEncrypt(p.token.trim()));
      if(p.clearToken)store.setSetting('sourceToken:'+id,null);
      store.setSource({...old,...s});changed();return true;
    }
    case 'importFile':{
      const source=store.sources().find(s=>s.id===p.id);if(!source)throw new Error('Okänd källa.');store.checkSource(source);
      const r=await dialog.showOpenDialog(win,{title:'Importera godkänt annonsflöde',properties:['openFile'],filters:[{name:'JSON',extensions:['json']}]});if(r.canceled)return null;
      if(fs.statSync(r.filePaths[0]).size>20*1024*1024)throw new Error('Filen är för stor (max 20 MB).');
      const result=store.importSnapshot(source,JSON.parse(fs.readFileSync(r.filePaths[0],'utf8')));store.sourceStatus(source.id,null,true);changed();return result;
    }
    case 'sync':return await sync(true);
    case 'watch':store.addWatch(p.name,p.filters,demo);changed();return true;
    case 'unwatch':store.removeWatch(p.id);changed();return true;
    case 'markWatch':store.markWatch(p.id);changed();return true;
    case 'openOffer':{const ad=store.detail(p.id,demo);if(ad.demo)throw new Error('Testannonser har ingen originalannons.');const offer=ad.offers.find(o=>o.id===p.offerId);if(!offer)throw new Error('Annonsen är inte aktiv.');await shell.openExternal(httpsURL(offer.url));return true;}
    case 'docs':{const s=sourceCatalog.find(s=>s.id===p.id);if(!s)throw new Error('Okänd källa.');await shell.openExternal(s.docs);return true;}
    default:throw new Error('Okänd funktion.');
  }
}
function createWindow(){
  win=new BrowserWindow({width:1320,height:900,minWidth:720,minHeight:620,title:'CarCrow',backgroundColor:'#f7f8f5',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',trafficLightPosition:{x:22,y:22},webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  win.webContents.session.webRequest.onBeforeSendHeaders((details,cb)=>{if(details.resourceType==='image')delete details.requestHeaders.Referer;cb({requestHeaders:details.requestHeaders});});
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  win.on('close',e=>{if(!quitting&&store.setting('background')){e.preventDefault();win.hide();}});
}
app.setName('CarCrow');
if(process.env.CARCROW_DATA_DIR)app.setPath('userData',process.env.CARCROW_DATA_DIR);
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{if(win){win.show();win.focus();}});
  app.whenReady().then(async()=>{
    const dataFile=path.join(app.getPath('userData'),'carcrow.sqlite');
    if(!process.env.CARCROW_DATA_DIR&&!fs.existsSync(dataFile))for(const name of ['Bilspan','bilspan']){const previous=path.join(app.getPath('appData'),name,'bilspan.sqlite');if(fs.existsSync(previous)){fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.copyFileSync(previous,dataFile);break;}}
    store=await Store.create(dataFile);
    store.setSetting('apiKey',null);store.setSetting('apiKeyVerified',null);
    store.setSetting('model','openrouter/free');
    if(process.env.CARCROW_TEST_DEMO!=='1'){try{provisionedKey=require('./provisioned-key.cjs');}catch(e){if(e.code!=='MODULE_NOT_FOUND')throw e;}}
    for(const s of sourceCatalog){const existing=store.sources().find(x=>x.id===s.id);if(!existing||s.adapter&&!existing.adapter)store.setSource({...existing,...s,enabled:!!s.adapter,mediaAllowed:!!s.adapter,feedURL:s.adapter?s.docs:'',intervalMinutes:60,retentionDays:s.id==='wayke'?90:30});}
    if(process.env.CARCROW_TEST_DEMO==='1'){store.setSetting('demo',true);seedDemo(store);}
    store.purgeExpired();
    market=new Market(store);agent=new CarAgent({store,market,key:aiKey,demo:demoMode,emit:e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:agent',e);}});
    ipcMain.handle('carcrow:call',async(event,action,payload)=>{
      if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==require('node:url').pathToFileURL(path.join(__dirname,'../dist/index.html')).href)return {ok:false,error:'Åtkomst nekad.'};
      try{return {ok:true,data:await dispatch(action,payload)};}catch(e){return {ok:false,error:e.message||'Något gick fel. Försök igen.'};}
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'CarCrow',submenu:[{role:'about'},{type:'separator'},{label:'Visa CarCrow',click:()=>win.show()},{role:'quit'}]},{label:'Redigera',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Fönster',submenu:[{role:'minimize'},{role:'zoom'},{role:'close'}]}]));
    createWindow();
    tray=new Tray(nativeImage.createFromPath(path.join(__dirname,'../assets/icon.png')).resize({width:18,height:18}));tray.setToolTip('CarCrow');tray.setContextMenu(Menu.buildFromTemplate([{label:'Öppna CarCrow',click:()=>win.show()},{label:'Avsluta',click:()=>app.quit()}]));
    setInterval(()=>sync().catch(()=>{}),60000).unref();if(process.env.CARCROW_TEST_DEMO!=='1')sync().catch(()=>{});
    app.on('activate',()=>{if(win&&!win.isDestroyed())win.show();else createWindow();});
  }).catch(e=>{dialog.showErrorBox('CarCrow kunde inte starta',e.message);app.quit();});
  app.on('before-quit',()=>{quitting=true;});app.on('window-all-closed',()=>{if(!store?.setting('background'))app.quit();});
}

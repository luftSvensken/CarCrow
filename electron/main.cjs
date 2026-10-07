const {app,BrowserWindow,ipcMain,safeStorage,shell,dialog,Menu,nativeTheme}=require('electron');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {Store,validateFilters,httpsURL}=require('./core.cjs');
const {requestJSON}=require('./services.cjs');
const {seedDemo}=require('./demo.cjs');
const {Market}=require('./market.cjs');const {CarAgent}=require('./agent.cjs');
const {SearchSessions}=require('./search-sessions.cjs');const {WatchChecker}=require('./watches.cjs');
const {Updater}=require('./updater.cjs');
const {EmbeddingRuntime}=require('./embedding-runtime.cjs');const {Recommendations}=require('./recommendations.cjs');
let store,market,sessions,watchChecker,recommendations,embedding,agent,updater,win,quitting=false,provisionedKey=null,lastOpen=null;
const marketRequests=new Map();
const sendMarket=e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:market',e);};
const sourceCatalog=[
  {id:'blocket',name:'Blocket',adapter:'blocket-public',hosts:['www.blocket.se','blocket.se'],docs:'https://blocket-api.se'},
  {id:'bytbil',name:'Bytbil',adapter:'public-html',hosts:['www.bytbil.com','bytbil.com'],docs:'https://www.bytbil.com'},
  {id:'wayke',name:'Wayke',adapter:'public-html',hosts:['www.wayke.se','wayke.se'],docs:'https://www.wayke.se/sok'},
  {id:'bilweb',name:'Bilweb',adapter:'public-html',hosts:['bilweb.se','www.bilweb.se'],docs:'https://bilweb.se'},
  {id:'kvd',name:'Kvdbil · fast pris',adapter:'kvd-public',hosts:['www.kvd.se','kvd.se'],docs:'https://www.kvd.se/begagnade-bilar?auctionType=BUY_NOW'},
  {id:'riddermark',name:'Riddermark Bil',adapter:'riddermark-public',hosts:['www.riddermarkbil.se'],docs:'https://www.riddermarkbil.se/kopa-bil/'}
];
function secureEncrypt(text){if(!safeStorage.isEncryptionAvailable())throw new Error('Operativsystemets säkra nyckellagring är inte tillgänglig. Nyckeln sparades inte.');return safeStorage.encryptString(text).toString('base64');}
function secureDecrypt(text){if(!text)return null;if(!safeStorage.isEncryptionAvailable())throw new Error('Nyckellagringen är låst. Lås upp operativsystemets nyckellagring.');return safeStorage.decryptString(Buffer.from(text,'base64'));}
function aiKey(){return provisionedKey;}
function demoMode(){return process.env.CARCROW_TEST_DEMO==='1';}
function sourcePublic(s){return {...s,hasToken:!!store.setting('sourceToken:'+s.id)};}
function changed(){if(win&&!win.isDestroyed())win.webContents.send('carcrow:changed');}
async function dispatch(action,p={}){
  if(!p||typeof p!=='object'||Array.isArray(p))throw new Error('Ogiltig begäran.');
  const demo=demoMode();
  switch(action){
    case 'bootstrap':return {stats:{...store.stats(demo),aiConfigured:!demoMode()&&!!require('./ai-config.json').endpoint,model:'openrouter/free'},facets:store.facets(demo),theme:store.setting('theme')||'system',dark:nativeTheme.shouldUseDarkColors,demo,sources:store.sources().filter(s=>!s.demo).map(sourcePublic),watches:store.watches(demo),checkingWatches:!!watchChecker.running,platform:process.platform,updates:updater.public(),version:app.getVersion()};
    case 'uiReady':updater.acknowledge();return true;
    case 'chats':return agent.list();
    case 'chat':return agent.get(p.id);
    case 'chatDelete':agent.remove(p.id);changed();return true;
    case 'agentStart':return agent.start({...p,ids:p.ids?.length?p.ids:/den här|denna bil|dess (?:fel|motor)/i.test(p.text||'')&&lastOpen&&Date.now()-lastOpen.at<600000?[lastOpen.id]:[]});
    case 'agentStop':agent.stop(p.runId);return true;
    case 'marketCancel':marketRequests.get(p.requestId)?.abort();return true;
    case 'marketStart':
    case 'marketPage':{
      const filters=validateFilters(p.filters);if(action==='marketStart'&&p.track)store.recordPreference('search',{filters});
      if(demo)return {...store.search(filters,true,0,false,null,false,p.excludeIds||[]),filters,hasMore:false};
      const requestId=p.requestId||crypto.randomUUID();if(typeof requestId!=='string'||!/^[-a-zA-Z0-9]{1,64}$/.test(requestId))throw new Error('Ogiltig sökbegäran.');
      const controller=new AbortController();marketRequests.set(requestId,controller);
      const options={signal:controller.signal,excludeIds:p.excludeIds||[],onProgress:e=>sendMarket({...e,requestId}),onResults:result=>sendMarket({type:'results',requestId,result})};
      try{const result=await (action==='marketPage'&&sessions.sessions.has(p.sessionId)?sessions.next(p.sessionId,p.excludeIds||[],options):sessions.start(filters,options));changed();return result;}
      finally{marketRequests.delete(requestId);}
    }
    case 'marketNext':{
      if(demo)return {...store.search(p.filters,true,p.page||0),filters:p.filters,hasMore:false};
      const result=await market.next(p.filters,{excludeIds:p.excludeIds||[],onProgress:e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:market',e);}});changed();return result;
    }
    case 'marketCoverage':return market.coverage(p.filters);
    case 'searchNext':{const r=store.search(p.filters,demo,0,!!p.saved,null,false,p.excludeIds||[]);return {...r,total:store.search(p.filters,demo,0,!!p.saved).total,remaining:r.total-r.items.length,filters:p.filters,hasMore:!!p.hasMore};}
    case 'search':{const result=store.search(p.filters,demo,p.page||0,!!p.saved,p.ids||null);if(p.compare)result.items=result.items.map(x=>({...x,comparison:store.comparison(x.id,demo)})).sort((a,b)=>(b.comparison.percentBelow??-Infinity)-(a.comparison.percentBelow??-Infinity));return result;}
    case 'detail':{const car=store.detail(p.id,demo);lastOpen={id:car.id,at:Date.now()};store.recordPreference('open',{id:car.id,text:require('./recommendations.cjs').document(car)});return car;}
    case 'compareSignal':{const car=store.detail(p.id,demo);store.recordPreference('compare',{id:car.id,text:require('./recommendations.cjs').document(car)});return true;}
    case 'bookmark':{const saved=store.bookmark(p.id);changed();return saved;}
    case 'archive':return store.archived(demo);
    case 'restoreBookmark':store.restoreBookmark(p.id);changed();return true;
    case 'recommendations':return await recommendations.get({onResults:result=>sendMarket({type:'results',requestId:p.requestId,result})});
    case 'updateCheck':return await updater.check();
    case 'updateInstall':return await updater.install();
    case 'updateCancel':updater.cancel();return true;
    case 'settings':{
      if(Object.hasOwn(p,'key')||Object.hasOwn(p,'model'))throw new Error('Appens AI-konfiguration är låst.');
      if(p.theme!==undefined){if(!['light','dark','system'].includes(p.theme))throw new Error('Okänt färgtema.');store.setSetting('theme',p.theme);nativeTheme.themeSource=p.theme;}
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
    case 'checkWatches':return await watchChecker.check();
    case 'watch':store.addWatch(p.name,p.filters,demo);changed();watchChecker.check().catch(()=>{});return true;
    case 'unwatch':store.removeWatch(p.id);changed();return true;
    case 'markWatch':store.markWatch(p.id);changed();return true;
    case 'openOffer':{const ad=store.detail(p.id,demo);if(ad.demo)throw new Error('Testannonser har ingen originalannons.');const offer=ad.offers.find(o=>o.id===p.offerId);if(!offer)throw new Error('Annonsen är inte aktiv.');store.recordPreference('original',{id:ad.id,text:require('./recommendations.cjs').document(ad)});await shell.openExternal(httpsURL(offer.url));return true;}
    case 'openWebSource':{const chat=agent.get(p.chatId);const source=chat?.messages.find(m=>m.id===p.messageId)?.sources?.find(s=>s.id===p.sourceId);if(!source)throw new Error('Okänd webbreferens.');await shell.openExternal(httpsURL(source.url));return true;}
    case 'docs':{const s=sourceCatalog.find(s=>s.id===p.id);if(!s)throw new Error('Okänd källa.');await shell.openExternal(s.docs);return true;}
    default:throw new Error('Okänd funktion.');
  }
}
function createWindow(){
  win=new BrowserWindow({width:1320,height:900,minWidth:720,minHeight:620,title:'CarCrow',backgroundColor:nativeTheme.shouldUseDarkColors?'#17181c':'#ffffff',titleBarStyle:process.platform==='darwin'?'hiddenInset':'default',trafficLightPosition:{x:22,y:22},webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
  win.webContents.session.webRequest.onBeforeSendHeaders((details,cb)=>{if(details.resourceType==='image')delete details.requestHeaders.Referer;cb({requestHeaders:details.requestHeaders});});
  win.loadFile(path.join(__dirname,'../dist/index.html'));
  nativeTheme.on('updated',()=>{if(win&&!win.isDestroyed()){win.setBackgroundColor(nativeTheme.shouldUseDarkColors?'#17181c':'#ffffff');changed();}});
}
app.setName('CarCrow');
if(process.env.CARCROW_DATA_DIR)app.setPath('userData',process.env.CARCROW_DATA_DIR);
if(!app.requestSingleInstanceLock())app.quit();else{
  app.on('second-instance',()=>{if(win){win.show();win.focus();if(!demoMode())watchChecker?.check().catch(()=>{});}});
  app.whenReady().then(async()=>{
    const dataFile=path.join(app.getPath('userData'),'carcrow.sqlite');
    if(!process.env.CARCROW_DATA_DIR&&!fs.existsSync(dataFile))for(const name of ['Bilspan','bilspan']){const previous=path.join(app.getPath('appData'),name,'bilspan.sqlite');if(fs.existsSync(previous)){fs.mkdirSync(path.dirname(dataFile),{recursive:true});fs.copyFileSync(previous,dataFile);break;}}
    store=await Store.create(dataFile);
    store.setSetting('apiKey',null);store.setSetting('apiKeyVerified',null);
    store.setSetting('model','openrouter/free');
    store.setSetting('background',false);store.setSetting('demo',demoMode());nativeTheme.themeSource=store.setting('theme')||'system';
    if(!demoMode()){store.db.run('DELETE FROM listings WHERE demo=1');store.db.run('DELETE FROM sources WHERE id IN (SELECT id FROM sources WHERE json_extract(config,\'$.demo\')=1)');}

    for(const s of sourceCatalog){const existing=store.sources().find(x=>x.id===s.id);store.setSource({...existing,...s,enabled:s.adapter&&!existing?.adapter?true:existing?.enabled??!!s.adapter,mediaAllowed:!!s.adapter,feedURL:s.adapter?s.docs:existing?.feedURL||'',intervalMinutes:60,retentionDays:7});}
    if(process.env.CARCROW_TEST_DEMO==='1'){store.setSetting('demo',true);seedDemo(store);}
    store.db.run("DELETE FROM sources WHERE id='facebook'");
    store.purgeExpired();
    market=new Market(store);sessions=new SearchSessions(store,market);agent=new CarAgent({store,market,sessions,key:aiKey,demo:demoMode,emit:e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:agent',e);}});
    const recommendationStatus=e=>{if(win&&!win.isDestroyed())win.webContents.send('carcrow:market',{source:'recommendations',label:e.label,status:e.ready?'done':'running'});};
    embedding=new EmbeddingRuntime(path.join(app.getPath('userData'),'recommendations'),{status:recommendationStatus,modelDir:app.isPackaged?path.join(process.resourcesPath,'models/embeddinggemma-2'):path.join(__dirname,'../models/embeddinggemma-2')});recommendations=new Recommendations({store,sessions,runtime:embedding,status:recommendationStatus,demo:demoMode});watchChecker=new WatchChecker({store,sessions,recommendations,changed,demo:demoMode});
    ipcMain.handle('carcrow:call',async(event,action,payload)=>{
      if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame||event.senderFrame.url!==require('node:url').pathToFileURL(path.join(__dirname,'../dist/index.html')).href)return {ok:false,error:'Åtkomst nekad.'};
      try{return {ok:true,data:await dispatch(action,payload)};}catch(e){return {ok:false,error:e.message||'Något gick fel. Försök igen.'};}
    });
    Menu.setApplicationMenu(Menu.buildFromTemplate([{label:'CarCrow',submenu:[{role:'about'},{type:'separator'},{label:'Visa CarCrow',click:()=>win.show()},{role:'quit'}]},{label:'Redigera',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},{label:'Fönster',submenu:[{role:'minimize'},{role:'zoom'},{role:'close'}]}]));
    updater=new Updater({app,changed});
    createWindow();
    if(app.isPackaged&&!demoMode())updater.check().catch(()=>{});
    if(!demoMode())watchChecker.check().catch(()=>{});
    app.on('activate',()=>{if(win&&!win.isDestroyed())win.show();else createWindow();if(!demoMode())watchChecker.check().catch(()=>{});});
  }).catch(e=>{dialog.showErrorBox('CarCrow kunde inte starta',e.message);app.quit();});
  app.on('before-quit',()=>{quitting=true;agent?.active?.controller.abort();embedding?.close();for(const request of marketRequests.values())request.abort();store?.db.close();});app.on('window-all-closed',()=>app.quit());
}

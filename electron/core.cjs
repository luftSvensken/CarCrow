const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

const FUELS = ['Bensin', 'Diesel', 'El', 'Laddhybrid', 'Hybrid', 'Etanol', 'Gas'];
const GEARS = ['Automat', 'Manuell'];
const SORTS = ['newest', 'priceAsc', 'priceDesc', 'mileage', 'deals'];
const numKeys = { minPrice:[0,100000000], maxPrice:[0,100000000], minYear:[1900,2100], maxYear:[1900,2100], maxMileage:[0,1000000] };
function cleanString(v, max=200) { if(typeof v !== 'string') throw new Error('Textfält har fel format.'); return v.trim().slice(0,max); }
function httpsURL(v) { const u = new URL(v); if(u.protocol !== 'https:' || u.username || u.password) throw new Error('Endast HTTPS-adresser utan inloggning stöds.'); return u.href; }
function validateFilters(raw={}) {
  const out = {};
  for(const k of Object.keys(raw)) {
    const v=raw[k]; if(v === null || v === undefined || v === '') continue;
    if(k in numKeys) { const [lo,hi]=numKeys[k]; if(!Number.isInteger(v)||v<lo||v>hi) throw new Error('Ogiltigt numeriskt sökfilter: '+k); out[k]=v; }
    else if(['makes','models','fuelTypes'].includes(k)) {
      if(!Array.isArray(v)||v.length>20||v.some(x=>typeof x !== 'string'||!x.trim()||x.length>100)) throw new Error('Ogiltigt filter: '+k);
      if(k==='fuelTypes' && v.some(x=>!FUELS.includes(x))) throw new Error('Okänt bränsle.'); out[k]=v.map(x=>x.trim());
    } else if(k==='gearbox') { if(!GEARS.includes(v)) throw new Error('Okänd växellåda.'); out[k]=v; }
    else if(k==='query') { out[k]=cleanString(v,300); }
    else if(k==='sort') { if(!SORTS.includes(v)) throw new Error('Okänd sortering.'); out[k]=v; }
    else throw new Error('Okänt sökfilter: '+k);
  }
  if(out.minPrice>out.maxPrice || out.minYear>out.maxYear) throw new Error('Från-värdet måste vara lägre än till-värdet.');
  return out;
}
function normalizeListing(raw,source) {
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) throw new Error('Ogiltig annons.');
  const required=['id','make','model','title','price','year','mileage','fuel','gearbox','url'];
  for(const k of required) if(raw[k]===undefined || raw[k]===null) throw new Error('Annons saknar '+k);
  const result={};
  for(const k of ['id','make','model','title']) { result[k]=cleanString(String(raw[k]),k==='title'?240:100); if(!result[k]) throw new Error('Tomt fält: '+k); }
  for(const [k,lo,hi] of [['price',1,100000000],['year',1900,2100],['mileage',0,1000000]]) {
    if(!Number.isInteger(raw[k])||raw[k]<lo||raw[k]>hi) throw new Error('Ogiltigt '+k); result[k]=raw[k];
  }
  if(!FUELS.includes(raw.fuel)||!GEARS.includes(raw.gearbox)) throw new Error('Okänt bränsle eller växellåda.');
  result.fuel=raw.fuel; result.gearbox=raw.gearbox; result.url=httpsURL(raw.url);
  const host=new URL(result.url).hostname;
  if(source.hosts && !source.hosts.includes(host)) throw new Error('Annonsens domän ingår inte i avtalet: '+host);
  for(const k of ['city','seller','variant','comparisonVariant','bodyType','description']) result[k]=raw[k]?cleanString(raw[k],k==='description'?6000:150):'';
  if(raw.images!==undefined && (!Array.isArray(raw.images)||raw.images.length>40)) throw new Error('Ogiltig bildlista.');
  result.images=(raw.images||[]).map(httpsURL);
  if(result.images.length && !source.mediaAllowed) throw new Error('Avtalet saknar tillstånd för bilder.');
  const published=raw.publishedAt ? Date.parse(raw.publishedAt):Date.now();
  if(!Number.isFinite(published)||published>Date.now()+86400000) throw new Error('Ogiltigt publiceringsdatum.');
  result.publishedAt=new Date(published).toISOString();
  result.registration=raw.registration?cleanString(raw.registration).replace(/[ -]/g,'').toUpperCase():null;
  result.vin=raw.vin?cleanString(raw.vin).toUpperCase():null;
  if(result.registration && !/^[A-Z0-9]{6,10}$/.test(result.registration)) throw new Error('Ogiltigt registreringsnummer.');
  if(result.vin && !/^[A-HJ-NPR-Z0-9]{17}$/.test(result.vin)) throw new Error('Ogiltigt VIN.');
  return result;
}
function comparisonFromRows(target,rows){
  if(!target.variant)return {sampleSize:0,median:null,percentBelow:null,peers:[],reason:'Variant behövs för en meningsfull jämförelse.'};
  const tolerance=Math.max(2000,target.mileage*.3);
  const peers=rows.filter(p=>p.vehicle_id!==target.vehicle_id&&p.year>=target.year-2&&p.year<=target.year+2&&p.mileage>=Math.max(0,target.mileage-tolerance)&&p.mileage<=target.mileage+tolerance).sort((a,b)=>a.price-b.price);
  const n=peers.length,median=n>=5?(n%2?peers[(n-1)/2].price:(peers[n/2-1].price+peers[n/2].price)/2):null;
  return {sampleSize:n,median,percentBelow:median?Math.round((1-target.price/median)*1000)/10:null,peers:peers.slice(0,24).map(p=>({id:p.vehicle_id,title:JSON.parse(p.data).title,price:p.price,year:p.year,mileage:p.mileage})),reason:(n<5?'Minst fem andra jämförbara bilar behövs. ':'Samma märke, modell, variant, bränsle och växellåda; årsmodell ±2 år och miltal ±30 % (minst ±2 000 mil). ')+(target.body_type?'Samma karosstyp.':'Karosstyp saknas i källan och är inte verifierad. Jämförelsen är därför mindre säker.')};
}
class Store {
  static async create(file) {
    const store=new Store(); store.file=file;
    let DatabaseSync;try{DatabaseSync=require('node:sqlite').DatabaseSync;}catch{}
    if(DatabaseSync){
      if(file){fs.mkdirSync(path.dirname(file),{recursive:true});if(!fs.existsSync(file))fs.closeSync(fs.openSync(file,'wx',0o600));}
      store.sqlite=new DatabaseSync(file||':memory:',{timeout:5000});
      store.db={run:(sql,args)=>{if(args)store.sqlite.prepare(sql).run(...args.map(x=>x===undefined?null:typeof x==='boolean'?Number(x):x));else store.sqlite.exec(sql);},exec:sql=>store.sqlite.exec(sql),close:()=>store.sqlite.close()};
    }else{
      const SQL=await initSqlJs({locateFile: f=>path.join(path.dirname(require.resolve('sql.js/dist/sql-wasm.js')),f)});
      store.db=new SQL.Database(file&&fs.existsSync(file)?fs.readFileSync(file):undefined);
    }
    if(store.sqlite)store.db.run('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
    store.db.run(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sources(id TEXT PRIMARY KEY,config TEXT NOT NULL,last_sync TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS vehicles(id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS identities(key TEXT PRIMARY KEY,vehicle_id TEXT NOT NULL REFERENCES vehicles(id));
      CREATE TABLE IF NOT EXISTS listings(id TEXT PRIMARY KEY,source_id TEXT NOT NULL,vehicle_id TEXT NOT NULL REFERENCES vehicles(id),
        make TEXT,model TEXT,price INTEGER,year INTEGER,mileage INTEGER,fuel TEXT,gearbox TEXT,variant TEXT,body_type TEXT,
        data TEXT NOT NULL,hash TEXT NOT NULL,active INTEGER NOT NULL,demo INTEGER NOT NULL,first_seen TEXT,last_seen TEXT,published TEXT);
      CREATE INDEX IF NOT EXISTS listing_search ON listings(demo,active,make,model,price,year,mileage);
      CREATE INDEX IF NOT EXISTS listing_vehicle ON listings(vehicle_id);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,listing_id TEXT,kind TEXT,at TEXT,old_price INTEGER,new_price INTEGER);
      CREATE TABLE IF NOT EXISTS bookmarks(vehicle_id TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS bookmark_archive(vehicle_id TEXT PRIMARY KEY,removed_at TEXT NOT NULL,expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS preference_events(id INTEGER PRIMARY KEY AUTOINCREMENT,kind TEXT NOT NULL,data TEXT NOT NULL,at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watch_recommendations(watch_id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watch_results(watch_id TEXT PRIMARY KEY,vehicle_ids TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS watch_checks(watch_id TEXT PRIMARY KEY,checked_at TEXT,error TEXT);
      CREATE TABLE IF NOT EXISTS watches(id TEXT PRIMARY KEY,name TEXT,filters TEXT,demo INTEGER,created TEXT,seen TEXT);`);
    store.salt=store.setting('identitySalt')||crypto.randomBytes(32).toString('hex');
    store.setSetting('identitySalt',store.salt); return store;
  }
  rows(sql,args=[]) {if(this.sqlite)return this.sqlite.prepare(sql).all(...args).map(r=>({...r}));const stmt=this.db.prepare(sql);try{stmt.bind(args);const rows=[];while(stmt.step())rows.push(stmt.getAsObject());return rows;}finally{stmt.free();} }
  save() { if(!this.file||this.sqlite)return;fs.mkdirSync(path.dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';fs.writeFileSync(tmp,Buffer.from(this.db.export()),{mode:0o600});fs.renameSync(tmp,this.file); }
  setting(k) { const r=this.rows('SELECT value FROM settings WHERE key=?',[k])[0];return r?JSON.parse(r.value):null; }
  setSetting(k,v) { this.db.run('INSERT OR REPLACE INTO settings VALUES (?,?)',[k,JSON.stringify(v)]);this.save(); }
  sources() { return this.rows('SELECT * FROM sources').map(s=>({...JSON.parse(s.config),lastSync:s.last_sync,error:s.error})); }
  setSource(s) { this.db.run('INSERT INTO sources(id,config) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET config=excluded.config',[s.id,JSON.stringify(s)]);this.save(); }
  sourceStatus(id,error,ok=false) { this.db.run('UPDATE sources SET error=?,last_sync=CASE WHEN ? THEN ? ELSE last_sync END WHERE id=?',[error,ok?1:0,new Date().toISOString(),id]);this.save(); }
  checkSource(source) {
    if(!source.demo && !source.enabled)throw new Error('Aktivera datakällan först.');
    if(!source.demo && source.approvedUntil && Date.parse(source.approvedUntil)<Date.now())throw new Error('Datakällans angivna åtkomstperiod har gått ut.');
  }
  importSnapshot(source,payload) {
    this.checkSource(source);
    if(!payload||payload.schemaVersion!==1||!Array.isArray(payload.listings)||payload.listings.length>100000||typeof payload.complete!=='boolean') throw new Error('Flödet följer inte CarCrow-format v1.');
    if(payload.complete && payload.listings.length===0 && payload.allowEmpty!==true) throw new Error('Tomt flöde stoppat. Bekräfta allowEmpty innan annonser kan tas bort.');
    const data=payload.listings.map(x=>normalizeListing(x,source));
    const ids=new Set(data.map(x=>x.id));if(ids.size!==data.length)throw new Error('Flödet har dubbla annons-ID.');
    const now=new Date().toISOString(),count={new:0,changed:0,removed:0,unchanged:0};
    this.db.run('BEGIN');
    try {
      for(const ad of data) {
        const listingId=source.id+':'+ad.id;
        const old=this.rows('SELECT * FROM listings WHERE id=?',[listingId])[0];
        const identityKeys=[ad.registration&&'reg:'+ad.registration,ad.vin&&'vin:'+ad.vin].filter(Boolean).map(k=>crypto.createHmac('sha256',this.salt).update((source.demo?'demo:':'live:')+k).digest('hex'));
        const linked=identityKeys.flatMap(k=>this.rows('SELECT vehicle_id FROM identities WHERE key=?',[k]).map(r=>r.vehicle_id));
        if(old)linked.push(old.vehicle_id);
        const linkedIDs=[...new Set(linked)].sort();const vehicleId=linkedIDs[0]||crypto.randomUUID();
        this.db.run('INSERT OR IGNORE INTO vehicles VALUES (?)',[vehicleId]);
        for(const merge of linkedIDs.slice(1)) {
          this.db.run('UPDATE listings SET vehicle_id=? WHERE vehicle_id=?',[vehicleId,merge]);
          this.db.run('UPDATE identities SET vehicle_id=? WHERE vehicle_id=?',[vehicleId,merge]);
          if(this.rows('SELECT * FROM bookmarks WHERE vehicle_id=?',[merge]).length)this.db.run('INSERT OR IGNORE INTO bookmarks VALUES (?)',[vehicleId]);
          const archived=this.rows('SELECT * FROM bookmark_archive WHERE vehicle_id=?',[merge])[0];if(archived)this.db.run('INSERT OR IGNORE INTO bookmark_archive VALUES (?,?,?)',[vehicleId,archived.removed_at,archived.expires_at]);
          this.db.run('DELETE FROM bookmark_archive WHERE vehicle_id=?',[merge]);
          this.db.run('DELETE FROM bookmarks WHERE vehicle_id=?',[merge]);this.db.run('DELETE FROM vehicles WHERE id=?',[merge]);
        }
        for(const key of identityKeys)this.db.run('INSERT OR REPLACE INTO identities VALUES (?,?)',[key,vehicleId]);
        delete ad.registration;delete ad.vin;
        const hash=crypto.createHash('sha256').update(JSON.stringify({...ad,publishedAt:undefined})).digest('hex');
        const kind=!old?'new':!old.active?'returned':old.hash!==hash?'changed':'unchanged';count[kind==='returned'?'new':kind]++;
        if(kind!=='unchanged')this.db.run('INSERT INTO events(listing_id,kind,at,old_price,new_price) VALUES (?,?,?,?,?)',[listingId,kind,now,old?.price??null,ad.price]);
        this.db.run(`INSERT INTO listings VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
          vehicle_id=excluded.vehicle_id,make=excluded.make,model=excluded.model,price=excluded.price,year=excluded.year,mileage=excluded.mileage,
          fuel=excluded.fuel,gearbox=excluded.gearbox,variant=excluded.variant,body_type=excluded.body_type,data=excluded.data,hash=excluded.hash,
          active=1,last_seen=excluded.last_seen,published=excluded.published`,
          [listingId,source.id,vehicleId,ad.make,ad.model,ad.price,ad.year,ad.mileage,ad.fuel,ad.gearbox,ad.comparisonVariant||ad.variant,ad.bodyType,JSON.stringify(ad),hash,1,source.demo?1:0,old?.first_seen||now,now,old?.published||ad.publishedAt]);
      }
      if(payload.complete)for(const old of this.rows('SELECT id,data,price FROM listings WHERE source_id=? AND active=1',[source.id])) {
        if(!ids.has(JSON.parse(old.data).id)) {this.db.run('UPDATE listings SET active=0,last_seen=? WHERE id=?',[now,old.id]);this.db.run('INSERT INTO events(listing_id,kind,at,old_price,new_price) VALUES (?,?,?,?,NULL)',[old.id,'removed',now,old.price]);count.removed++;}
      }
      this.db.run('COMMIT');this.save();return count;
    }catch(e){this.db.run('ROLLBACK');throw e;}
  }
  // All query fragments originate here; user text and model output are parameters only.
  search(raw={},demo=false,page=0,onlySaved=false,selectedIds=null,watchOnly=false,excludeIds=[]) {
    if(!Number.isInteger(page)||page<0||page>Number.MAX_SAFE_INTEGER/48)throw new Error('Ogiltig resultatsida.');
    const f=validateFilters(raw);const params=[demo?1:0];const where=[];
    for(const [k,col] of [['makes','make'],['models','model'],['fuelTypes','fuel']])if(f[k]?.length){where.push(`${col} COLLATE NOCASE IN (${f[k].map(()=>'?').join(',')})`);params.push(...f[k]);}
    for(const [k,col,op] of [['minPrice','price','>='],['maxPrice','price','<='],['minYear','year','>='],['maxYear','year','<='],['maxMileage','mileage','<=']])if(f[k]!==undefined){where.push(`${col}${op}?`);params.push(f[k]);}
    if(f.gearbox){where.push('gearbox=?');params.push(f.gearbox);}
    if(f.query){where.push("(make||' '||model||' '||data) LIKE ? ESCAPE '\\'");params.push('%'+f.query.replace(/[\\%_]/g,'\\$&')+'%');}
    if(!Array.isArray(excludeIds)||excludeIds.some(id=>typeof id!=='string'||id.length>100))throw new Error('Ogiltiga bil-ID.');
    if(excludeIds.length){where.push('vehicle_id NOT IN (SELECT value FROM json_each(?))');params.push(JSON.stringify(excludeIds));}
    if(onlySaved)where.push('vehicle_id IN (SELECT vehicle_id FROM bookmarks)');
    if(selectedIds){if(!selectedIds.length)return {items:[],total:0,page};if(!Array.isArray(selectedIds)||selectedIds.some(x=>typeof x!=='string'||x.length>100))throw new Error('Ogiltigt bilurval.');where.push('vehicle_id IN (SELECT value FROM json_each(?))');params.push(JSON.stringify(selectedIds));}
    const base=`WITH ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY vehicle_id ORDER BY price,id) rn FROM listings WHERE active=1 AND demo=?) SELECT * FROM ranked WHERE rn=1${where.length?' AND '+where.join(' AND '):''}`;
    const total=this.rows('SELECT COUNT(*) n FROM ('+base+')',params)[0].n;
    const order={newest:'published DESC',priceAsc:'price ASC',priceDesc:'price DESC',mileage:'mileage ASC',deals:'price ASC'}[f.sort||'newest'];
    if(watchOnly&&f.sort!=='deals')return {ids:this.rows('SELECT vehicle_id FROM ('+base+')',params).map(x=>x.vehicle_id),total};
    let rows=this.rows(base+' ORDER BY '+order+(f.sort==='deals'?'':' LIMIT 48 OFFSET ?'),f.sort==='deals'?params:[...params,page*48]);
    if(f.sort==='deals'){
      const universe=this.rows('WITH ranked AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY vehicle_id ORDER BY price,id) rn FROM listings WHERE active=1 AND demo=?) SELECT * FROM ranked WHERE rn=1',[demo?1:0]);
      const cohorts=new Map(),group=r=>JSON.stringify([r.make.toLowerCase(),r.model.toLowerCase(),r.fuel,r.gearbox,r.variant.toLowerCase(),r.body_type.toLowerCase()]);
      for(const row of universe){const k=group(row);if(!cohorts.has(k))cohorts.set(k,[]);cohorts.get(k).push(row);}
      const candidates=rows.map(row=>({row,comparison:comparisonFromRows(row,cohorts.get(group(row))||[])})).filter(x=>x.comparison.percentBelow!==null&&x.comparison.percentBelow>=5).sort((a,b)=>b.comparison.percentBelow-a.comparison.percentBelow);
      return watchOnly?{ids:candidates.map(x=>x.row.vehicle_id),total:candidates.length}:{items:candidates.slice(page*48,page*48+48).map(x=>({...this.present(x.row),comparison:x.comparison})),total:candidates.length,page};
    }
    let items=rows.map(r=>this.present(r));
    return {items,total,page};
  }
  present(row) {
    const sources=this.sources();const ad=JSON.parse(row.data);
    const offers=this.rows('SELECT * FROM listings WHERE vehicle_id=? AND active=1 ORDER BY price',[row.vehicle_id]).map(r=>{const x=JSON.parse(r.data);return {id:r.id,sourceId:r.source_id,source:sources.find(s=>s.id===r.source_id)?.name||r.source_id,price:r.price,url:x.url,lastSeen:r.last_seen};});
    return {...ad,id:row.vehicle_id,listingId:row.id,source:offers.find(o=>o.id===row.id)?.source||row.source_id,offers,lastSeen:row.last_seen,firstSeen:row.first_seen,demo:!!row.demo,saved:!!this.rows('SELECT * FROM bookmarks WHERE vehicle_id=?',[row.vehicle_id]).length};
  }
  detail(id,demo=false) {
    const r=this.rows('SELECT * FROM listings WHERE vehicle_id=? AND demo=? ORDER BY active DESC,price LIMIT 1',[id,demo?1:0])[0];
    if(!r)throw new Error('Bilen finns inte längre i den här databasen.');
    return {...this.present(r),active:!!r.active,comparison:this.comparison(id,demo),history:this.rows('SELECT e.*,s.config FROM events e JOIN listings l ON l.id=e.listing_id LEFT JOIN sources s ON s.id=l.source_id WHERE l.vehicle_id=? ORDER BY e.at DESC,e.id DESC LIMIT 40',[id]).map(e=>({...e,source:e.config?JSON.parse(e.config).name:''}))};
  }
  comparison(id,demo=false) {
    const target=this.rows('SELECT * FROM listings WHERE vehicle_id=? AND demo=? AND active=1 ORDER BY price LIMIT 1',[id,demo?1:0])[0];
    if(!target)return {sampleSize:0,median:null,percentBelow:null,peers:[],reason:'Annonsen är borttagen.'};
    if(!target.variant)return {sampleSize:0,median:null,percentBelow:null,peers:[],reason:'Variant behövs för en meningsfull jämförelse.'};
    const peers=this.rows(`WITH ranked AS(SELECT *,ROW_NUMBER() OVER(PARTITION BY vehicle_id ORDER BY price) rn FROM listings WHERE demo=? AND active=1)
      SELECT * FROM ranked WHERE rn=1 AND vehicle_id!=? AND make=? COLLATE NOCASE AND model=? COLLATE NOCASE AND fuel=? AND gearbox=?
      AND variant=? COLLATE NOCASE AND body_type=? COLLATE NOCASE AND year BETWEEN ? AND ? AND mileage BETWEEN ? AND ? ORDER BY price`,
      [demo?1:0,id,target.make,target.model,target.fuel,target.gearbox,target.variant,target.body_type,target.year-2,target.year+2,Math.max(0,target.mileage-Math.max(2000,target.mileage*.3)),target.mileage+Math.max(2000,target.mileage*.3)]);
    const n=peers.length;const median=n>=5?(n%2?peers[(n-1)/2].price:(peers[n/2-1].price+peers[n/2].price)/2):null;
    return {sampleSize:n,median,percentBelow:median?Math.round((1-target.price/median)*1000)/10:null,peers:peers.slice(0,24).map(p=>({id:p.vehicle_id,title:JSON.parse(p.data).title,price:p.price,year:p.year,mileage:p.mileage})),reason:(n<5?'Minst fem andra jämförbara bilar behövs. ':'Samma märke, modell, variant, bränsle och växellåda; årsmodell ±2 år och miltal ±30 % (minst ±2 000 mil). ')+(target.body_type?'Samma karosstyp.':'Karosstyp saknas i källan och är inte verifierad. Jämförelsen är därför mindre säker.')};
  }
  bookmark(id) {
    if(!this.rows('SELECT * FROM vehicles WHERE id=?',[id]).length)throw new Error('Okänd bil.');
    const exists=this.rows('SELECT * FROM bookmarks WHERE vehicle_id=?',[id]).length;
    if(exists){const now=new Date();this.db.run('INSERT OR REPLACE INTO bookmark_archive VALUES (?,?,?)',[id,now.toISOString(),new Date(now.getTime()+86400000).toISOString()]);this.db.run('DELETE FROM bookmarks WHERE vehicle_id=?',[id]);}
    else {this.db.run('INSERT OR IGNORE INTO bookmarks VALUES (?)',[id]);this.db.run('DELETE FROM bookmark_archive WHERE vehicle_id=?',[id]);}
    this.save();return !exists;
  }
  archived(demo=false) {
    this.purgeArchive();return this.rows('SELECT * FROM bookmark_archive ORDER BY removed_at DESC').flatMap(row=>{try{return [{...this.detail(row.vehicle_id,demo),removedAt:row.removed_at,expiresAt:row.expires_at}];}catch{return [];}});
  }
  restoreBookmark(id) {
    this.purgeArchive();if(!this.rows('SELECT vehicle_id FROM bookmark_archive WHERE vehicle_id=?',[id]).length)throw new Error('Bilens återställningstid har gått ut.');
    this.db.run('INSERT OR IGNORE INTO bookmarks VALUES (?)',[id]);this.db.run('DELETE FROM bookmark_archive WHERE vehicle_id=?',[id]);this.save();return true;
  }
  purgeArchive(now=Date.now()) {this.db.run('DELETE FROM bookmark_archive WHERE expires_at<=?',[new Date(now).toISOString()]);this.save();}
  recordPreference(kind,data){
    if(!['search','open','compare','original'].includes(kind))throw new Error('Okänd användningssignal.');
    const json=JSON.stringify(data),previous=this.rows('SELECT data,at FROM preference_events WHERE kind=? ORDER BY id DESC LIMIT 1',[kind])[0];
    if(previous?.data===json&&Date.now()-Date.parse(previous.at)<3600000)return;
    this.db.run('INSERT INTO preference_events(kind,data,at) VALUES (?,?,?)',[kind,json,new Date().toISOString()]);
    this.db.run('DELETE FROM preference_events WHERE id NOT IN (SELECT id FROM preference_events ORDER BY id DESC LIMIT 120)');this.save();
  }
  watchPicks(id,items){if(!this.rows('SELECT id FROM watches WHERE id=?',[id]).length)return;this.db.run('INSERT OR REPLACE INTO watch_recommendations VALUES (?,?)',[id,JSON.stringify(items.map(c=>({id:c.id,recommendation:c.recommendation})))]);this.save();}
  watchChecked(id,error=null,ids) {if(!this.rows('SELECT id FROM watches WHERE id=?',[id]).length)return;if(ids)this.db.run('INSERT OR REPLACE INTO watch_results VALUES (?,?)',[id,JSON.stringify(ids)]);this.db.run('INSERT OR REPLACE INTO watch_checks VALUES (?,?,?)',[id,new Date().toISOString(),error]);this.save();}
  excludeListing(id) {this.db.run('UPDATE listings SET active=0 WHERE id=?',[id]);this.save();}
  removeListing(id) {const row=this.rows('SELECT * FROM listings WHERE id=? AND active=1',[id])[0];if(!row)return;const now=new Date().toISOString();this.db.run('UPDATE listings SET active=0,last_seen=? WHERE id=?',[now,id]);this.db.run('INSERT INTO events(listing_id,kind,at,old_price,new_price) VALUES (?,?,?,?,NULL)',[id,'removed',now,row.price]);this.save();}
  facets(demo=false) {const rows=this.rows('SELECT DISTINCT make,model FROM listings WHERE active=1 AND demo=? ORDER BY make,model',[demo?1:0]);return {makes:[...new Set(rows.map(x=>x.make))],models:rows,fuels:FUELS};}
  stats(demo=false) {return {...this.rows('SELECT COUNT(*) listings,COUNT(DISTINCT vehicle_id) vehicles,MAX(last_seen) updated FROM listings WHERE active=1 AND demo=?',[demo?1:0])[0],sources:this.sources().filter(s=>!s.demo).map(s=>({id:s.id,name:s.name,enabled:s.enabled,lastSync:s.lastSync,error:s.error})),aiConfigured:!!this.setting('apiKey'),model:'openrouter/free'};}
  watches(demo=false) {return this.rows('SELECT * FROM watches WHERE demo=? ORDER BY created DESC',[demo?1:0]).map(w=>{const filters=JSON.parse(w.filters);const current=this.rows('SELECT vehicle_ids FROM watch_results WHERE watch_id=?',[w.id])[0];const result=this.search(filters,demo,0,false,current?JSON.parse(current.vehicle_ids):null,true);const seen=new Set(JSON.parse(w.seen));const checked=this.rows('SELECT checked_at,error FROM watch_checks WHERE watch_id=?',[w.id])[0];const picks=this.rows('SELECT data FROM watch_recommendations WHERE watch_id=?',[w.id])[0];const ranking=picks?JSON.parse(picks.data):[];const valid=new Map(this.search(filters,demo,0,false,ranking.map(c=>c.id)).items.map(c=>[c.id,c]));const items=ranking.flatMap(c=>valid.has(c.id)?[{...valid.get(c.id),recommendation:c.recommendation}]:[]);return {id:w.id,name:w.name,filters,items,total:result.total,newCount:result.ids.filter(id=>!seen.has(id)).length,checkedAt:checked?.checked_at||null,error:checked?.error||null};});}
  addWatch(name,filters,demo=false) {filters=validateFilters(filters);const seen=this.search(filters,demo,0,false,null,true).ids;this.db.run('INSERT INTO watches VALUES (?,?,?,?,?,?)',[crypto.randomUUID(),cleanString(name,100)||'Min sökning',JSON.stringify(filters),demo?1:0,new Date().toISOString(),JSON.stringify(seen)]);this.save();}
  removeWatch(id) {this.db.run('DELETE FROM watches WHERE id=?',[id]);this.db.run('DELETE FROM watch_checks WHERE watch_id=?',[id]);this.db.run('DELETE FROM watch_results WHERE watch_id=?',[id]);this.db.run('DELETE FROM watch_recommendations WHERE watch_id=?',[id]);this.save();}
  markWatch(id) {const w=this.rows('SELECT * FROM watches WHERE id=?',[id])[0];if(w){this.db.run('UPDATE watches SET seen=? WHERE id=?',[JSON.stringify(this.search(JSON.parse(w.filters),!!w.demo,0,false,null,true).ids),id]);this.save();}}
  purgeExpired() {
    this.purgeArchive();
    const now=Date.now();for(const s of this.sources().filter(s=>!s.demo)) {
      if(s.approvedUntil && Date.parse(s.approvedUntil)<now) {this.db.run('DELETE FROM events WHERE listing_id IN (SELECT id FROM listings WHERE source_id=?)',[s.id]);this.db.run('DELETE FROM listings WHERE source_id=?',[s.id]);}
      else if(s.retentionDays) {const cutoff=new Date(now-s.retentionDays*86400000).toISOString();const eligible='source_id=? AND last_seen<? AND vehicle_id NOT IN (SELECT vehicle_id FROM bookmarks UNION SELECT vehicle_id FROM bookmark_archive)';this.db.run('DELETE FROM events WHERE listing_id IN (SELECT id FROM listings WHERE '+eligible+')',[s.id,cutoff]);this.db.run('DELETE FROM listings WHERE '+eligible,[s.id,cutoff]);}
    }this.save();
  }
}
module.exports={Store,validateFilters,normalizeListing,httpsURL,FUELS,GEARS,SORTS};

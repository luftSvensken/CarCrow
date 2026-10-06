const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../electron/core.cjs');
const {Market}=require('../electron/market.cjs');
const {SearchSessions}=require('../electron/search-sessions.cjs');
const {WatchChecker}=require('../electron/watches.cjs');
const source={id:'blocket',name:'Blocket',enabled:true,mediaAllowed:true,adapter:'blocket-public',hosts:['www.blocket.se']};
const car={id:'old',title:'BMW 320d',make:'BMW',model:'3-serie',variant:'320d',price:140000,year:2017,mileage:12000,fuel:'Diesel',gearbox:'Automat',url:'https://www.blocket.se/annons/old',images:[]};
async function setup(){const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[car]});return s;}
test('unsaving removes a car immediately and allows restoration for exactly 24 hours',async()=>{
 const s=await setup(),id=s.search().items[0].id;s.bookmark(id);assert.equal(s.search({},false,0,true).total,1);s.bookmark(id);assert.equal(s.search({},false,0,true).total,0);
 const a=s.archived()[0];assert.equal(a.id,id);assert.equal(Date.parse(a.expiresAt)-Date.parse(a.removedAt),86400000);s.restoreBookmark(id);assert.equal(s.archived().length,0);assert.equal(s.search({},false,0,true).total,1);
 s.bookmark(id);s.purgeArchive(Date.parse(s.archived()[0].expiresAt));assert.equal(s.archived().length,0);assert.throws(()=>s.restoreBookmark(id),/gått ut/);
});
test('old ad cache expires while saved and recently archived cars retain their data',async()=>{
 const s=await setup();s.setSource({...source,retentionDays:7});const id=s.search().items[0].id;s.bookmark(id);s.db.run('UPDATE listings SET last_seen=?',['2000-01-01T00:00:00Z']);s.purgeExpired();assert.equal(s.detail(id).saved,true);s.bookmark(id);s.purgeExpired();assert.equal(s.archived().length,1);s.purgeArchive(Date.now()+86400001);s.purgeExpired();assert.equal(s.search().total,0);
});
test('each new search requests the current first page and excludes unrelated old cached ads',async()=>{
 const s=await setup();let serial=0;const pages=[];
 const native=(id)=>({id,heading:'BMW 320d',price:{amount:120000,currency_code:'SEK'},make:'BMW',model:'320d',series:'3-Serie',year:2018,mileage:9000,mileage_unit:'SCANDINAVIAN_MILE',fuel:'Diesel',transmission:'Automatisk',canonical_url:'https://www.blocket.se/annons/'+id,sales_form:1});
 const market=new Market(s,{request:async url=>{pages.push(url);return {docs:[native('fresh-'+(++serial))],metadata:{is_end_of_paging:true}};}});
 const sessions=new SearchSessions(s,market),a=await sessions.start({}),b=await sessions.start({});assert.equal(pages.length,2);assert.equal(a.items.length,1);assert.equal(b.items.length,1);assert.ok(a.items.every(x=>x.id!==s.rows('SELECT vehicle_id FROM listings WHERE id=?',['blocket:old'])[0].vehicle_id));assert.notEqual(a.sessionId,b.sessionId);assert.equal(a.coverage.blocket.pages,1);assert.equal(b.coverage.blocket.pages,1);
});
test('a watch is checked again on every independent opening and records partial source failures',async()=>{
 const s=await setup();s.addWatch('BMW',{makes:['BMW']});let calls=0;const checker=new WatchChecker({store:s,sessions:{start:async()=>{calls++;return {sourceWarning:calls===1?'En källa otillgänglig':null};}}});
 await checker.check();assert.equal(calls,1);assert.ok(s.watches()[0].checkedAt);assert.match(s.watches()[0].error,/källa/);await checker.check();assert.equal(calls,2);assert.equal(s.watches()[0].error,null);
});

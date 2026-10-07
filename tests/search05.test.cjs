const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../electron/core.cjs');
const {Market}=require('../electron/market.cjs');
const {SearchSessions}=require('../electron/search-sessions.cjs');
const {CarAgent}=require('../electron/agent.cjs');
const {userIntent,groundedFilters}=require('../electron/search-intent.cjs');
const {buildURL}=require('../electron/blocket.cjs');
const source={id:'blocket',name:'Blocket',enabled:true,mediaAllowed:true,adapter:'blocket-public',hosts:['www.blocket.se']};
const base={id:'1',make:'Volvo',model:'V70',variant:'II D4 e S/S Summum Business E PRO II',title:'Volvo V70',price:55000,year:2012,mileage:18000,fuel:'Diesel',gearbox:'Automat',url:'https://www.blocket.se/annons/1',images:[]};
const native=(id,extra={})=>({id,heading:'Volvo V70',make:'Volvo',model:'V70',model_specification:'D4 Business Edition',year:2012,mileage:18000,mileage_unit:'SCANDINAVIAN_MILE',fuel:'Diesel',transmission:'Automatisk',price:{amount:55000,currency_code:'SEK'},canonical_url:'https://www.blocket.se/annons/'+id,sales_form:1,...extra});
async function setup(listings=[]){const s=await Store.create();s.setSource(source);if(listings.length)s.importSnapshot(source,{schemaVersion:1,complete:false,listings});return s;}
test('V70 business matches words across real source fields, independently of order and casing',async()=>{
 const s=await setup([base,{...base,id:'2',variant:'D5 Momentum'}, {...base,id:'3',make:'BMW',model:'3-serie',title:'BMW 320d Business',variant:'320d Business'}]);
 for(const query of ['V70 business','business V70','VOLVO v 70 BUSINESS','v70 busin'])assert.equal(s.search({query}).total,1,query);
 assert.equal(s.search({query:'V70'}).total,2);assert.equal(s.search({query:'V70 dragkrok'}).total,0);s.db.close();
});
test('normal search handles brand aliases, accents, spelling and OR alternatives without indexing URLs',async()=>{
 const s=await setup([base,{...base,id:'2',make:'Volkswagen',model:'Golf',title:'Volkswagen Golf',variant:'Business'}, {...base,id:'3',make:'Citroën',model:'C4',title:'Citroën C4',variant:''}]);
 for(const query of ['VW golf','volksvagen golf','volkswagen golf businesss','citroen c4'])assert.equal(s.search({query}).total,1,query);
 assert.equal(s.search({query:'V70 eller Golf'}).total,2);assert.equal(s.search({query:'annons'}).total,0);assert.equal(s.search({query:'%'}).total,0);s.db.close();
});
test('relevance prioritizes model and title over incidental description, retaining hard price filters',async()=>{
 const s=await setup([{...base,id:'1',description:'Golf Business är en bil vi tar i inbyte'}, {...base,id:'2',make:'Volkswagen',model:'Golf',title:'Volkswagen Golf Business',variant:'Business',price:58000}, {...base,id:'3',make:'Volkswagen',model:'Golf',title:'Volkswagen Golf Business',variant:'Business',price:90000}]);
 const r=s.search({query:'Golf business',maxPrice:60000,sort:'relevance'});assert.equal(r.total,2);assert.equal(r.items[0].make,'Volkswagen');assert.equal(s.search({query:'Golf business',maxPrice:60000,sort:'priceAsc'}).items[0].price,55000);s.db.close();
});
test('structured BMW series and badges agree across sources and are pushed to the source search',async()=>{
 const s=await setup([{...base,make:'BMW',model:'320d',title:'BMW 320d',variant:'M Sport'}]);
 assert.equal(s.search({makes:['BMW'],models:['3-serien']}).total,1);assert.equal(s.search({makes:['BMW'],models:['5-serie']}).total,0);
 const u=new URL(buildURL({makes:['BMW'],models:['3-serie'],maxPrice:199999}));assert.equal(u.searchParams.get('models'),'BMW');assert.match(u.searchParams.get('query'),/3-serie/);assert.equal(u.searchParams.get('price_to'),'199999');s.db.close();
});
test('an offer containing the requested trim survives deduplication even when another offer is cheaper',async()=>{
 const s=await setup([{...base,registration:'ABC123',variant:'D4',price:50000}]),other={...source,id:'other'};s.setSource(other);s.importSnapshot(other,{schemaVersion:1,complete:false,listings:[{...base,id:'9',registration:'ABC123',variant:'D4 Business Edition'}]});
 const r=s.search({query:'V70 business'});assert.equal(r.total,1);assert.equal(r.items[0].variant,'D4 Business Edition');assert.equal(r.items[0].offers.length,2);s.db.close();
});
test('retrieval fills a page instead of stopping at one first-page match',async()=>{
 const s=await setup();let calls=0;const market=new Market(s,{request:async url=>{calls++;const p=Number(new URL(url).searchParams.get('page'));return {docs:p===1?[native('early')]:Array.from({length:49},(_,i)=>native('later-'+i)),metadata:{paging:{last:2},is_end_of_paging:p===2}};}}),sessions=new SearchSessions(s,market);
 const r=await sessions.start({query:'V70 business'});assert.equal(calls,2);assert.equal(r.total,50);assert.equal(r.items.length,48);assert.equal(r.searchComplete,true);assert.equal(r.hasMore,false);s.db.close();
});
test('OR source searches visit both alternatives before declaring a useful result page',async()=>{
 const s=await setup();const queries=[];const market=new Market(s,{request:async url=>{const q=new URL(url).searchParams.get('query');queries.push(q);return {docs:Array.from({length:50},(_,i)=>native(q+i,{make:q==='audi'?'Audi':'BMW',heading:q+' car',model:'A4',model_specification:''})),metadata:{paging:{last:9}}};}}),sessions=new SearchSessions(s,market);
 const r=await sessions.start({query:'BMW eller Audi'});assert.deepEqual(queries,['bmw','audi']);assert.equal(r.total,100);assert.equal(r.hasMore,true);s.db.close();
});
test('first-car advice cannot silently impose makes, models, year, mileage or fuels',()=>{
 const texts=['Jag söker en billig pålitlig första bil','under 60000 helst lägre'],intent=userIntent(texts);
 assert.deepEqual(intent,{sort:'priceAsc',maxPrice:59999});
 assert.deepEqual(groundedFilters({makes:['Honda','Mazda'],models:['Jazz'],minYear:2010,maxMileage:500000,fuelTypes:['Bensin','Hybrid'],maxPrice:60000},intent,texts),intent);
 assert.deepEqual(userIntent(['BMW eller Audi under 150 000 kr, automat och max 15 000 mil']),{makes:['Audi','BMW'],maxPrice:149999,maxMileage:15000,gearbox:'Automat'});
});
test('an observed free-model answer cannot claim three database cars while 48 are shown',()=>{
 const {conciseAnswer}=require('../electron/answer.cjs');const answer=conciseAnswer('Databasen visar för närvarande tre bilar under 60 000 kr. Citroën Berlingo (2011, diesel, 135 000 km, automat).',Array.from({length:48},()=>({...base})),{maxPrice:59999,hasMore:true});assert.doesNotMatch(answer,/tre bilar|135 000 km/);assert.match(answer,/visade urvalet/);assert.match(answer,/Fler annonser/);
});
test('source-confirmed matches from omitted original text remain scoped and keep every hard requirement',async()=>{
 const s=await setup();const market=new Market(s,{request:async()=>({docs:[native('with',{model_specification:'D4 Summum'}),native('too-expensive',{model_specification:'D4 Summum',price:{amount:90000,currency_code:'SEK'}})],metadata:{is_end_of_paging:true}})}),sessions=new SearchSessions(s,market);
 const r=await sessions.start({query:'V70 business',maxPrice:60000});assert.equal(r.total,1);assert.equal(r.items[0].price,55000);assert.equal(s.search({query:'V70 business'}).total,0);const next=await sessions.next(r.sessionId);assert.equal(next.total,1);s.db.close();
});
test('AI waits for late source results and corrects a false only-one claim against the completed cohort',async()=>{
 const s=await setup(),late={...source,id:'late',name:'Sen källa'};s.setSource(late);let released=false;const events=[];
 const market=new Market(s,{request:async url=>{const q=new URL(url).searchParams;if(q.get('page')==='1'&&!released){released=true;await new Promise(r=>setTimeout(r,130));return {docs:[native('a')],metadata:{is_end_of_paging:true}};}await new Promise(r=>setTimeout(r,240));return {docs:Array.from({length:5},(_,i)=>native('b'+i)),metadata:{is_end_of_paging:true}};}}),sessions=new SearchSessions(s,market);
 const agent=new CarAgent({store:s,market,sessions,key:()=>null,emit:e=>events.push(e),stream:async({messages,model})=>{const output=JSON.parse(messages.at(-1).content.split(': ').slice(1).join(': '));assert.equal(output.displayedCount,6);assert.equal(output.searchComplete,true);return {role:'assistant',content:'Endast en bil hittades under 60 000 kr.',model};}});
 const chat={id:'wait',title:'Test',messages:[{role:'user',text:'Billig bil under 60 000 kr'}],context:[],cars:[],filters:{}};const message={id:'answer',role:'assistant',text:'',activities:[],status:'running'};
 await agent.run(chat,message,{text:'Billig bil under 60 000 kr',filters:{},ids:[],runId:'run',signal:new AbortController().signal});
 assert.equal(message.status,'done');assert.equal(chat.cars.length,6);assert.doesNotMatch(message.text,/endast en|bara en/i);assert.ok(events.some(e=>e.type==='results'&&e.result.searchComplete===false));assert.equal(chat.filters.maxPrice,59999);s.db.close();
});
test('verified results remain usable when the free model truncates its final answer',async()=>{
 const s=await setup(),market=new Market(s,{request:async()=>({docs:[native('a'),native('b')],metadata:{is_end_of_paging:true}})}),sessions=new SearchSessions(s,market);
 const agent=new CarAgent({store:s,market,sessions,key:()=>null,emit:()=>{},stream:async()=>{throw new Error('AI-svaret blev inte färdigt. Försök igen.');}});
 const chat={id:'truncate',title:'Test',messages:[{role:'user',text:'V70 under 60 000 kr'}],context:[],cars:[],filters:{}},message={id:'a',role:'assistant',text:'',activities:[],status:'running'};
 await agent.run(chat,message,{text:'V70 under 60 000 kr',filters:{},ids:[],runId:'run',signal:new AbortController().signal});assert.equal(message.status,'done');assert.equal(chat.cars.length,2);assert.match(message.text,/visade urvalet/);s.db.close();
});
test('nominal prices and buying headlines cannot become cheap sale recommendations',async()=>{
 const {normalizeListing}=require('../electron/core.cjs'),{parseCar}=require('../electron/blocket.cjs');
 assert.equal(parseCar(native('nominal',{price:{amount:1,currency_code:'SEK'}})),null);
 for(const ad of [{...base,price:1},{...base,title:'Volvo bilar köpes nyare eller äldre modeller'},{...base,title:'Vi köper din Volvo'}])assert.throws(()=>normalizeListing(ad,source));
 const s=await setup([{...base,price:5000,title:'Volvo V70 reparationsobjekt',description:'Vi köper din gamla bil i inbyte.'}]);assert.equal(s.search({maxPrice:60000}).total,1);s.db.close();
});
test('watch source-confirmed matches survive display and seen tracking while numeric constraints remain strict',async()=>{
 const s=await setup([{...base,variant:'D4 Summum'},{...base,id:'2',price:90000,variant:'D4 Summum'}]);s.addWatch('Business',{query:'business',maxPrice:60000});const w=s.watches()[0],cars=s.search().items,ids=cars.map(c=>c.id);s.watchChecked(w.id,null,ids);s.watchPicks(w.id,cars.map(c=>({...c,recommendation:{score:1}})));
 const result=s.watches()[0];assert.equal(result.total,1);assert.equal(result.items.length,1);assert.equal(result.newCount,1);s.markWatch(w.id);assert.equal(s.watches()[0].newCount,0);s.db.close();
});
test('a denied source is not requested again while other sources fill the page',async()=>{
 const s=await setup(),other={...source,id:'other',name:'Andra källa'};s.setSource(other);let requests=0;
 const market=new Market(s,{request:async()=>{requests++;if(requests===1){const e=new Error('HTTP 403');e.status=403;throw e;}return {docs:[native('car'+requests)],metadata:{paging:{last:4}}};}}),sessions=new SearchSessions(s,market);
 const r=await sessions.start({query:'V70'});assert.equal(requests,5);assert.ok(r.sourceWarning?.includes('403'));assert.equal(r.marketComplete,false);assert.equal(r.items.length,4);s.db.close();
});
test('qualitative first-car retrieval samples current and cheapest cohorts without inventing hard requirements',async()=>{
 const s=await setup(),sorts=[];const market=new Market(s,{request:async url=>{const sort=new URL(url).searchParams.get('sort_order');sorts.push(sort);return {docs:Array.from({length:50},(_,i)=>native(sort+i,{price:{amount:(sort==='PRICE_ASC'?5000:45000)+i,currency_code:'SEK'}})),metadata:{is_end_of_paging:true}};}}),sessions=new SearchSessions(s,market);
 const r=await sessions.start({maxPrice:59999,sort:'priceAsc'},{diverse:true});assert.deepEqual(sorts,['PRICE_ASC','PUBLISHED_DESC']);assert.equal(r.items.length,96);assert.equal(r.total,100);assert.ok(r.items.some(c=>c.price>45000));assert.deepEqual(r.filters,{maxPrice:59999,sort:'priceAsc'});const next=await sessions.next(r.sessionId,r.items.map(c=>c.id));assert.equal(next.total,100);assert.equal(next.items.length,4);s.db.close();
});
test('a misformatted model tool call becomes a grounded answer instead of leaking tool syntax',()=>{
 const {conciseAnswer}=require('../electron/answer.cjs');assert.doesNotMatch(conciseAnswer('<tool_call><function=search_market><parameter=filters>{"minPrice":15000}</parameter></function></tool_call>',[base]),/tool_call|search_market|parameter/);
});

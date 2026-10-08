const test=require('node:test');
const assert=require('node:assert/strict');
const {Store}=require('../electron/core.cjs');
const {Market}=require('../electron/market.cjs');
const {SearchSessions}=require('../electron/search-sessions.cjs');
const {CarAgent}=require('../electron/agent.cjs');
const {preferences,rankCandidates}=require('../electron/shopping.cjs');
const {userIntent}=require('../electron/search-intent.cjs');
const {parseWaykeDetail,verifyHTMLSource}=require('../electron/html-sources.cjs');
const {parseWebListing}=require('../electron/web-listings.cjs');

const source={id:'blocket',name:'Blocket',enabled:true,adapter:'blocket-public',hosts:['www.blocket.se'],mediaAllowed:true};
const base={id:'a',title:'Honda Jazz',make:'Honda',model:'Jazz',price:55000,year:2012,mileage:14000,fuel:'Bensin',gearbox:'Manuell',bodyType:'Halvkombi',url:'https://www.blocket.se/a',images:[]};
const doc=(id,price=55000)=>({id,heading:'Honda Jazz',make:'Honda',model:'Jazz',year:2012,mileage:14000,mileage_unit:'SCANDINAVIAN_MILE',fuel:'Bensin',transmission:'Manuell',price:{amount:price,currency_code:'SEK'},canonical_url:'https://www.blocket.se/'+id,sales_form:1});
const options=()=>({signal:new AbortController().signal,emit:()=>{},activity:()=>({}),message:{}});
const message=()=>({id:'m',role:'assistant',text:'',activities:[]});
const chat=text=>({id:'test',title:'Bil',messages:[{role:'user',text}],context:[],cars:[],filters:{}});
const by={...source,id:'bytbil',name:'Bytbil',adapter:'public-html',hosts:['www.bytbil.com']};
const bytbilHTML=(price,description)=>'<h1 class="vehicle-detail-title">Honda Jazz</h1><div class="vehicle-detail-price">'+price+'</div><dl class="object-info-box">'+Object.entries({'Märke':'Honda','Modell':'Jazz','Drivmedel':'Bensin','Växellåda':'Manuell','Miltal':'14000','Årsmodell':'2012'}).map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl><div class="vehicle-description">'+description+'</div>';

test('a confirmed monthly original deactivates the cached offer before AI selection',async()=>{
 const s=await Store.create();s.setSource(by);
 s.importSnapshot(by,{schemaVersion:1,complete:false,listings:[{...base,id:'123',url:'https://www.bytbil.com/honda-jazz-123',price:2995},{...base,id:'124',url:'https://www.bytbil.com/honda-jazz-124'}]});
 const cached=s.search({maxPrice:3000}).items[0];s.bookmark(cached.id);
 const market=new Market(s,{request:async()=>bytbilHTML('2 995 kr','Månadskostnad: 2 995 kr')});
 const inspected=await market.inspect(cached.id);
 assert.equal(inspected.active,false);assert.equal(inspected.checks[0].status,'excluded');assert.equal(s.search().total,1);assert.equal(s.detail(cached.id).saved,true);
 const a=new CarAgent({store:s,market,key:()=>null,emit:()=>{}});
 await assert.rejects(a.execute('select_cars',{selections:[{id:cached.id,reason:'Inom budget.'}]},{cars:[],searchCars:[cached],filters:{maxPrice:60000}},options()));s.db.close();
});

test('background HTML verification excludes monthly offers but preserves unparseable originals',async()=>{
 const s=await Store.create();s.setSource(by);s.importSnapshot(by,{schemaVersion:1,complete:false,listings:[{...base,id:'123',url:'https://www.bytbil.com/honda-jazz-123'}]});
 const id=s.search().items[0].id;
 await verifyHTMLSource(s,by,{request:async()=>'<html>Changed format</html>'});assert.equal(s.detail(id).active,true);
 await verifyHTMLSource(s,by,{request:async()=>bytbilHTML('2 995 kr/mån','Leasing')});assert.equal(s.detail(id).active,false);s.db.close();
});

test('structured lease rejection is explicit for Wayke and web original inspections',async()=>{
 const data={'@type':'Car',name:'Honda Jazz',brand:{name:'Honda'},model:'Jazz',vehicleModelDate:'2012',mileageFromOdometer:{value:140000,unitCode:'KMT'},vehicleTransmission:'Manuell',vehicleEngine:{fuelType:'Bensin'},offers:{price:2995,priceCurrency:'SEK',priceSpecification:{unitCode:'MON'}}};
 const html='<script type="application/ld+json">'+JSON.stringify(data)+'</script>';
 assert.equal(parseWaykeDetail(html,'https://www.wayke.se/objekt/a').excluded,true);assert.equal(parseWebListing(html,'https://dealer.example/car/a').excluded,true);
 const s=await Store.create(),web={...source,id:'web:dealer.example',name:'Dealer',adapter:undefined,webVerified:true,hosts:['dealer.example']};s.setSource(web);
 const initial=parseWebListing('<script type="application/ld+json">'+JSON.stringify({...data,offers:{price:55000,priceCurrency:'SEK'}})+'</script>','https://dealer.example/car/a');s.importSnapshot(web,{schemaVersion:1,complete:false,listings:[initial]});
 const id=s.search().items[0].id,result=await new Market(s,{request:async()=>html}).inspect(id);assert.equal(result.active,false);assert.equal(result.checks[0].status,'excluded');s.db.close();
});

test('later brand choices release previous rejections and rejecting a current make releases its hard filter',()=>{
 const texts=['Jag vill inte ha Volvo, max 60000 kr','Jag har ändrat mig, hitta en Volvo V70'];
 const intent=userIntent(texts),p=preferences(texts);assert.deepEqual(p.excludedMakes,[]);assert.deepEqual(intent.makes,['Volvo']);assert.equal(rankCandidates([{...base,id:'v',make:'Volvo',model:'V70'}],p,intent).length,1);
 assert.deepEqual(preferences(['Inte Volvo','Alla märken']).excludedMakes,[]);
 assert.deepEqual(preferences(['Inte Volvo, jag har ändrat mig till Volvo V70']).excludedMakes,[]);
 const released=userIntent(['Honda Jazz','Inte Honda']);assert.equal(released.makes,undefined);assert.equal(released.models,undefined);assert.deepEqual(preferences(['Honda Jazz','Inte Honda']).excludedMakes,['Honda']);
});

test('diverse cohorts keep cheap and newer cars even when the cheap lane fills the entire page',async()=>{
 const s=await Store.create();s.setSource(source);s.setSource({...source,id:'other',name:'Other'});
 const market=new Market(s,{request:async url=>{const cheap=new URL(url).searchParams.get('sort_order')==='PRICE_ASC';return {docs:Array.from({length:50},(_,i)=>({...doc((cheap?'cheap':'good')+i,cheap?3000+i:55000+i),heading:cheap?'Honda Jazz reparationsobjekt':'Honda Jazz',year:cheap?2001:2012,mileage:cheap?36000:14000})),metadata:{is_end_of_paging:true}};}});
 const sessions=new SearchSessions(s,market),result=await sessions.start({maxPrice:60000,sort:'priceAsc'},{diverse:true});
 assert.equal(result.total,200);assert.equal(result.items.length,96);assert.equal(result.items.filter(c=>c.price>=15000).length,48);assert.equal(new Set(result.items.map(c=>c.id)).size,96);
 const a=new CarAgent({store:s,market,sessions,key:()=>null,emit:()=>{}}),c={cars:[],searchCars:result.items,sessionId:result.sessionId,hardFilters:{maxPrice:60000},preferences:preferences(['Första bil']),filters:{maxPrice:60000}};
 const ranked=a.matchingCandidates(c);assert.equal(ranked.length,200);assert.ok(ranked[0].price>=15000);s.db.close();
});

test('three AI priorities retain every retrieved matching card, including cards outside the tool sample',async()=>{
 const s=await Store.create();s.setSource(source);
 s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...base,id:'old',url:'https://www.blocket.se/old'}]});
 const market=new Market(s,{request:async()=>({docs:Array.from({length:100},(_,i)=>doc('current-'+i)),metadata:{is_end_of_paging:true}})});market.inspect=async id=>s.detail(id);
 const sessions=new SearchSessions(s,market),events=[];
 const a=new CarAgent({store:s,market,sessions,key:()=>null,emit:e=>events.push(e),stream:async({messages})=>{const last=messages.at(-1);if(last.role==='tool')return {role:'assistant',content:'Börja med de prioriterade bilarna. Alla matchningar finns i listan.',model:'free'};const result=JSON.parse(last.content.slice(last.content.indexOf(': ')+2));return {role:'assistant',content:null,model:'free',tool_calls:[{id:'pick',type:'function',function:{name:'select_cars',arguments:JSON.stringify({selections:result.cars.slice(0,3).map(c=>({id:c.id,reason:'Inom din budget.'}))})}}]};}});
 const c=chat('Hitta Honda Jazz max 60000 kr'),m=message();await a.run(c,m,{text:c.messages[0].text,filters:{},ids:[],runId:'r',signal:new AbortController().signal});
 assert.equal(m.status,'done');assert.equal(c.cars.length,100);assert.equal(c.cars.filter(car=>car.selectionReason).length,3);assert.equal(new Set(c.cars.map(car=>car.id)).size,100);assert.equal(a.get(c.id).cars.length,100);assert.equal(c.hasMore,false);assert.ok(events.some(e=>e.type==='results'&&e.result.items.length>3));s.db.close();
});

test('an incomplete AI answer preserves all matches and removes a price that changed above the budget',async()=>{
 const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[base]});const original=s.search().items[0];let turn=0;
 const a=new CarAgent({store:s,key:()=>null,emit:()=>{},market:{next:async()=>({...s.search({maxPrice:60000}),hasMore:false,searchComplete:true}),inspect:async id=>{s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...base,price:90000}]});return s.detail(id);}},stream:async()=>{if(turn++===0)return {role:'assistant',content:null,model:'free',tool_calls:[{id:'inspect',type:'function',function:{name:'inspect_car',arguments:JSON.stringify({id:original.id})}}]};throw new Error('AI-svaret blev inte färdigt.');}});
 const c=chat('Hitta Honda Jazz max 60000 kr'),m=message();await a.run(c,m,{text:c.messages[0].text,filters:{},ids:[],runId:'r',signal:new AbortController().signal});assert.equal(m.status,'done');assert.equal(c.cars.length,0);assert.equal(s.search(c.hardFilters).total,0);s.db.close();
});

test('AI failure never caps an otherwise valid cohort at eight cards',async()=>{
 const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:Array.from({length:30},(_,i)=>({...base,id:String(i),url:'https://www.blocket.se/'+i}))});
 const a=new CarAgent({store:s,key:()=>null,emit:()=>{},market:{next:async()=>({...s.search(),hasMore:false,searchComplete:true})},stream:async()=>{throw new Error('AI-svaret blev inte färdigt.');}}),c=chat('Hitta Honda Jazz max 60000 kr'),m=message();await a.run(c,m,{text:c.messages[0].text,filters:{},ids:[],runId:'r',signal:new AbortController().signal});assert.equal(m.status,'done');assert.equal(c.cars.length,30);s.db.close();
});

test('chat pagination retrieves source pages without AI calls and persists every matching car',async()=>{
 const s=await Store.create();s.setSource(source);const requests=[];
 const market=new Market(s,{request:async url=>{const page=Number(new URL(url).searchParams.get('page'));requests.push(page);return {docs:Array.from({length:page===3?2:50},(_,i)=>doc(page+'-'+i)),metadata:{paging:{last:3}}};}});market.inspect=async id=>s.detail(id);
 const sessions=new SearchSessions(s,market),a=new CarAgent({store:s,market,sessions,key:()=>null,emit:()=>{},stream:async()=>{throw new Error('Pagination must not call AI');}}),c=chat('Honda Jazz');c.hardFilters={maxPrice:60000};
 await a.execute('search_market',{filters:c.hardFilters},c,options());const priorities=c.searchCars.slice(0,3);await a.execute('select_cars',{selections:priorities.map(car=>({id:car.id,reason:'Inom budget.'}))},c,options());a.save(c);
 assert.equal(c.cars.length,50);assert.equal(c.hasMore,true);const next=await a.more(c.id,options());assert.equal(next.items.length,100);assert.equal(next.hasMore,true);
 const end=await a.more(c.id,options());assert.equal(end.items.length,102);assert.equal(end.hasMore,false);assert.equal(new Set(end.items.map(car=>car.id)).size,102);assert.deepEqual(end.items.slice(0,3).map(car=>car.id),priorities.map(car=>car.id));assert.equal(a.get(c.id).cars.length,102);assert.deepEqual(requests,[1,2,3]);s.db.close();
});

test('observed free-model sales claims require evidence in the actual advertisement',()=>{
 const {groundedSelectionAnswer}=require('../electron/agent.cjs');
 for(const value of ['Toyota Yaris har beprövad drivlina.','Skoda Fabia har bra bränsleekonomi.','Volkswagen Golf har solid byggkvalitet och låg underhållskostnad.','Honda Jazz har full service och gott skick.'])assert.notEqual(groundedSelectionAnswer(value,[base]),value);
 const stated='Honda Jazz har full service enligt annonsen.';assert.equal(groundedSelectionAnswer(stated,[{...base,description:'Full service enligt säljaren.'}]),stated);
});


test('inspecting one car preserves every matching card and its AI priority',async()=>{
 const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:Array.from({length:100},(_,i)=>({...base,id:String(i),url:'https://www.blocket.se/'+i}))});
 const a=new CarAgent({store:s,market:{inspect:async id=>s.detail(id)},key:()=>null,emit:()=>{}}),c=chat('Honda Jazz');c.hardFilters={maxPrice:60000};c.filters=c.hardFilters;const first=s.search(c.filters);c.searchCars=[...first.items,...s.search(c.filters,false,1).items,...s.search(c.filters,false,2).items];const id=c.searchCars[0].id;c.prioritizedIds=[id];c.cars=[{...c.searchCars[0],selectionReason:'Inom din budget.'}];
 a.publishMatches(c);await a.execute('inspect_car',{id},c,options());assert.equal(c.cars.length,100);assert.equal(c.cars[0].id,id);assert.equal(c.cars[0].selectionReason,'Inom din budget.');s.db.close();
});

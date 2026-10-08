const test=require('node:test'),assert=require('node:assert/strict');
const {saleIssue,cashAmount}=require('../electron/sale-quality.cjs');
const {userIntent,manualIntent}=require('../electron/search-intent.cjs');
const {Store}=require('../electron/core.cjs'),{Market,sourceGroups}=require('../electron/market.cjs'),{SearchSessions}=require('../electron/search-sessions.cjs'),{CarAgent}=require('../electron/agent.cjs');
const {rankCandidates,preferences}=require('../electron/shopping.cjs');
const source={id:'blocket',name:'Blocket',enabled:true,adapter:'blocket-public',hosts:['www.blocket.se'],mediaAllowed:true};
const base={id:'a',title:'Honda Jazz',make:'Honda',model:'Jazz',price:55000,year:2012,mileage:14000,fuel:'Bensin',gearbox:'Manuell',bodyType:'Halvkombi',url:'https://www.blocket.se/a',images:[]};
const native=(id,price=50000)=>({id,heading:'Honda Jazz',make:'Honda',model:'Jazz',year:2012,mileage:14000,mileage_unit:'SCANDINAVIAN_MILE',fuel:'Bensin',transmission:'Manuell',price:{amount:price,currency_code:'SEK'},canonical_url:'https://www.blocket.se/'+id,sales_form:1});
test('cash price classification rejects monthly units, deposits and bids, preserving real cash sales with financing',()=>{
 for(const ad of [{priceText:'2 995 kr/månad'},{description:'Månadskostnad: 2 995 kr'},{description:'Finansiering 2 995 kr per månad'},{priceSpecification:{unitCode:'MON'}},{priceSpecification:{unitText:'månad'}},{businessFunction:'https://purl.org/goodrelations/v1#LeaseOut'},{priceType:'Deposit'},{priceText:'Högsta bud: 2995 kr'}])assert.ok(saleIssue({...base,price:2995,...ad}),JSON.stringify(ad));
 for(const ad of [{price:5000,description:'Reparationsobjekt, säljes kontant.'},{title:'Honda Jazz leasing eller köp',description:'Kontantpris 55 000 kr. Privatleasing från 2 995 kr/mån.'},{description:'Finansiering 2 995 kr/mån. Vi köper också bilar i inbyte.'}])assert.equal(saleIssue({...base,...ad}),null);
 assert.equal(cashAmount('55 000 kr'),55000);assert.equal(cashAmount('2995 kr/mån, 55000 kr kontant'),null);
});
test('conversation changes accept a budget reply and explicitly release old constraints',()=>{
 assert.equal(userIntent(['Första bil','60k']).maxPrice,60000);
 assert.equal(userIntent(['BMW automat under 150000 kr','Manuell eller automat spelar ingen roll']).gearbox,undefined);
 const f=userIntent(['Volvo V70 diesel max 20000 mil','Alla märken och andra modeller, ingen milgräns och inte diesel']);assert.equal(f.makes,undefined);assert.equal(f.models,undefined);assert.equal(f.maxMileage,undefined);assert.ok(!f.fuelTypes.includes('Diesel'));
 assert.deepEqual(manualIntent({query:'Honda Jazz bensin under 60 000 kr'}),{query:'Honda Jazz',fuelTypes:['Bensin'],maxPrice:59999});
});
test('first-car ranking rewards useful everyday cars over repair objects without removing cheap ads from normal search',()=>{
 const p=preferences(['Billig pålitlig första bil']),cars=[{...base,id:'bad',title:'Honda Jazz reparationsobjekt',price:3000,year:2001,mileage:36000},{...base,id:'good'},{...base,id:'less',mileage:22000}];
 assert.equal(rankCandidates(cars,p,{maxPrice:60000})[0].id,'good');assert.equal(rankCandidates(cars,p,{maxPrice:60000},['good'])[0].id,'less');assert.equal(rankCandidates(cars,preferences(['Inte Honda']),{}).length,0);
});
test('Kvd uses one cursor per supported brand, without duplicating unsupported query/model alternatives',()=>assert.equal(sourceGroups({makes:['Honda','Toyota'],models:['Jazz','Yaris'],query:'Business eller Sport'},'kvd-public').length,2));
test('diverse paging preserves both source cursors and limited windows never claim complete market coverage',async()=>{
 const s=await Store.create();s.setSource(source);const requests=[];const market=new Market(s,{request:async url=>{const u=new URL(url),sort=u.searchParams.get('sort_order'),page=Number(u.searchParams.get('page'));requests.push(sort+':'+page);return {docs:Array.from({length:50},(_,i)=>native(sort+'-'+page+'-'+i)),metadata:{paging:{last:3},result_size:{match_count:999}}};}}),sessions=new SearchSessions(s,market);
 const a=await sessions.start({sort:'priceAsc'},{diverse:true});assert.equal(a.items.length,96);assert.equal(a.marketComplete,false);let seen=a.items.map(c=>c.id);let b=await sessions.next(a.sessionId,seen,{diverse:true});seen.push(...b.items.map(c=>c.id));b=await sessions.next(a.sessionId,seen,{diverse:true});assert.ok(requests.includes('PRICE_ASC:2'));assert.ok(requests.includes('PUBLISHED_DESC:2'));assert.equal(b.retrieval.alternativesTotal,2);s.db.close();
});
test('AI exploration pools alternatives while the final shortlist must satisfy the original hard budget',async()=>{
 const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[base,{...base,id:'b',make:'Toyota',model:'Yaris',title:'Toyota Yaris',url:'https://www.blocket.se/b'},{...base,id:'c',price:90000,url:'https://www.blocket.se/c'}]});
 const a=new CarAgent({store:s,demo:()=>false,key:()=>null,emit:()=>{}}),cars=s.search().items,chat={cars:[],searchCars:cars,filters:{makes:['Honda']},hardFilters:{maxPrice:60000},searchQueryIds:[]},options={signal:new AbortController().signal,emit:()=>{},activity:()=>({}),message:{}};
 await a.execute('select_cars',{selections:cars.filter(c=>c.price<60000).map(c=>({id:c.id,reason:'Ett kompakt alternativ inom budget.'}))},chat,options);assert.equal(chat.cars.length,2);await assert.rejects(a.execute('select_cars',{selections:[{id:cars.find(c=>c.price===90000).id,reason:'Billig'}]},chat,options));s.db.close();
});
test('a vague first-car request asks for budget before network retrieval',async()=>{
 const s=await Store.create(),a=new CarAgent({store:s,key:()=>null,emit:()=>{},market:{next:()=>{throw new Error('Must not retrieve before budget');}},stream:()=>{throw new Error('Must not request AI for this clarification');}}),chat={id:'budget',title:'Budget',messages:[{role:'user',text:'Jag vill ha en billig första bil'}],context:[],cars:[],filters:{}},m={id:'m',role:'assistant',text:'',activities:[]};await a.run(chat,m,{text:'Jag vill ha en billig första bil',filters:{},ids:[],runId:'r',signal:new AbortController().signal});assert.equal(m.status,'done');assert.match(m.text,/budget/i);s.db.close();
});

test('web answers cannot turn miles or kilometres into Swedish mil without conversion',()=>{const {guardWebAnswer}=require('../electron/agent.cjs'),sources=[{number:1,read:true,excerpt:'Service every 12,000 miles or 12 months.'}];assert.doesNotMatch(guardWebAnswer('Byt olja varje 12 000 mil [1].',sources,[base]),/12 000 mil/);});

test('a short final Blocket page does not falsely mark complete retrieval as limited',async()=>{const s=await Store.create();s.setSource(source);const market=new Market(s,{request:async url=>{const p=Number(new URL(url).searchParams.get('page'));return {docs:Array.from({length:p===1?50:2},(_,i)=>native(p+'-'+i)),metadata:{paging:{last:2},result_size:{match_count:52}}};}});await market.next({});const r=await market.next({});assert.equal(r.coverage.blocket.limited,false);s.db.close();});
test('HTML sources emit a bounded batch and keep pending original URLs for the next page',async()=>{
 const s=await Store.create(),src={id:'bytbil',name:'Bytbil',enabled:true,adapter:'public-html',hosts:['www.bytbil.com'],mediaAllowed:true};s.setSource(src);let lists=0,details=0;
 const market=new Market(s,{request:async url=>{if(new URL(url).pathname==='/bil'){lists++;return Array.from({length:14},(_,i)=>'<div class="result-list-item"><a class="js-link-target" href="/volvo-v70-'+i+'">Bil</a></div>').join('');}details++;return '<h1 class="vehicle-detail-title">Volvo V70</h1><div class="vehicle-detail-price">55 000 kr</div><dl class="object-info-box">'+Object.entries({'Märke':'Volvo','Modell':'V70','Drivmedel':'Bensin','Växellåda':'Manuell','Miltal':'14000','Årsmodell':'2012'}).map(([k,v])=>'<dt>'+k+'</dt><dd>'+v+'</dd>').join('')+'</dl>';}});
 const first=await market.next({});assert.equal(details,12);assert.equal(first.hasMore,true);assert.equal(first.total,12);const next=await market.next({});assert.equal(lists,1);assert.equal(details,14);assert.equal(next.total,14);assert.equal(next.hasMore,false);s.db.close();
});

test('switching models drops the previous model trim but preserves the explicit budget',()=>{const f=userIntent(['Volvo V70 Business max 60000 kr','Jag vill istället hitta en Honda Jazz']);assert.deepEqual(f.models,['Jazz']);assert.equal(f.query,undefined);assert.equal(f.maxPrice,60000);});
test('a question about a selected car does not become a new brand or model requirement',async()=>{
 const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[base]});const car=s.search().items[0],a=new CarAgent({store:s,key:()=>null,emit:()=>{},web:{search:async()=>({sources:[{id:'read',number:1,read:true,title:'Honda Jazz',url:'https://example.com/jazz',excerpt:'Check the service records.'}]})},stream:async()=>({role:'assistant',content:'Kontrollera servicehistoriken [1].',model:'free'})}),chat={id:'facts',title:'BMW',messages:[{role:'user',text:'BMW max 150000 kr'},{role:'user',text:'Vad bör jag kontrollera på den här Honda Jazz innan köp?'}],context:[],cars:[car],filters:{}},m={id:'a',role:'assistant',text:'',activities:[]};await a.run(chat,m,{text:chat.messages.at(-1).text,filters:{},ids:[car.id],runId:'r',signal:new AbortController().signal});assert.equal(m.status,'done');assert.deepEqual(chat.filters.makes,['BMW']);assert.equal(chat.filters.models,undefined);assert.equal(chat.messages.at(-1).contextualQuestion,true);s.db.close();
});

const test=require('node:test'),assert=require('node:assert/strict');
const {kvdPage,kvdURL,riddermarkPage}=require('../electron/dealer-sources.cjs');
const {Store,normalizeListing}=require('../electron/core.cjs'),{Market}=require('../electron/market.cjs'),{SearchSessions}=require('../electron/search-sessions.cjs'),{CarAgent}=require('../electron/agent.cjs');
const auction={id:'306030',auctionType:'BUY_NOW',buyNowAvailable:true,state:'OPEN',currency:'SEK',buyNowAmount:179900,winningBid:42000,mediationFee:5238,auctionUrl:'https://www.kvd.se/fast-pris/audi-a3-306030',previewImages:[{uri:'https://kvdbil-images.imgix.net/7291061/car.jpg'}],processObject:{properties:{adHeader:'Audi A3 Sportback',title:'Audi A3',brand:'Audi',familyName:'A3',modelName:'35 TFSI',modelYear:2019,odometerUnit:'km',odometerReading:90760,gearbox:'Automatic',fuels:[{fuelCode:'Petrol'}],registrationPlate:'EJE594'}}};
test('Kvdbil uses fixed prices and Swedish mil; bids, sold cars and missing cash prices cannot be shown',()=>{
 const source={id:'kvd',hosts:['www.kvd.se'],mediaAllowed:true};const [ad]=kvdPage({auctions:[auction]}).listings;assert.equal(ad.price,179900);assert.equal(ad.mileage,9076);assert.match(ad.description,/5\s*238/);assert.equal(normalizeListing(ad,source).gearbox,'Automat');
 for(const change of [{auctionType:'AUCTION'},{buyNowAvailable:false},{state:'CLOSED'},{buyNowAmount:null},{currency:'EUR'}])assert.equal(kvdPage({auctions:[{...auction,...change}]}).listings.length,0);
 const url=new URL(kvdURL({},3,'BMW'));assert.equal(url.searchParams.get('offset'),'40');assert.equal(url.searchParams.get('brand'),'BMW');
});
test('Riddermark skips sold and unpriced cars and preserves declared units',()=>{
 const car={id:1,title:'BMW 320d',make:'BMW',series:'3-serie',model:'320d',modelYear:2018,mileage:9000,price:180000,fuelType:'Diesel',gearboxType:'Automatisk',licenseplate:'ABC123'};
 const html='<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{carsJson:[car,{...car,id:2,isSold:true},{...car,id:3,isBeingPriced:true}]}}})+'</script><a href="/kopa-bil/bmw/abc123/">Bil</a>';
 const result=riddermarkPage(html);assert.equal(result.listings.length,1);assert.equal(result.listings[0].mileage,9000);assert.equal(result.listings[0].price,180000);
});
test('fresh sessions fill the matching page and continued AI searches retain earlier cars',async()=>{
 const s=await Store.create();s.setSource({id:'kvd',name:'Kvdbil',hosts:['www.kvd.se'],enabled:true,mediaAllowed:true,adapter:'kvd-public'});const pages=[];
 const market=new Market(s,{request:async url=>{const offset=Number(new URL(url).searchParams.get('offset'));pages.push(offset);const ads=Array.from({length:20},(_,i)=>({...auction,id:String(offset+i),auctionUrl:'https://www.kvd.se/fast-pris/audi-a3-'+(offset+i),buyNowAmount:offset===0?200000:120000,processObject:{properties:{...auction.processObject.properties,registrationPlate:null}}}));return {auctions:ads,hits:80};}});
 const sessions=new SearchSessions(s,market),agent=new CarAgent({store:s,market,sessions,key:()=>'',emit:()=>{}}),chat={filters:{},cars:[]},options={signal:new AbortController().signal,emit:()=>{},activity:()=>({})};
 const first=await agent.execute('search_market',{filters:{maxPrice:150000}},chat,options);assert.deepEqual(pages,[0,20,40,60]);assert.equal(first.cars.length,48);assert.equal(first.displayedCount,60);assert.equal(first.sampleIsSubset,true);const initial=new Set(chat.searchCars.map(c=>c.id));
 const second=await agent.execute('search_market',{filters:{maxPrice:150000}},chat,options);assert.deepEqual(pages,[0,20,40,60]);assert.equal(second.displayedCount,60);assert.equal(chat.searchCars.filter(c=>!initial.has(c.id)).length,0);assert.ok([...initial].every(id=>chat.searchCars.some(c=>c.id===id)));
 await sessions.start({maxPrice:150000});assert.deepEqual(pages.slice(-4),[0,20,40,60]);
});

test('Bytbil translates the verified BMW family label used by its ordinary search form',()=>{const {listURL}=require('../electron/html-sources.cjs');assert.equal(new URL(listURL('bytbil',{models:['3-serie']},'BMW')).searchParams.get('Models'),'3-serien');});

test('final chat removes duplicate car tables and hit counts while retaining the source caveat',()=>{const {conciseAnswer}=require('../electron/answer.cjs');const input='Hittade 4 BMW som matchar:\n\n| Bil | Pris |\n|---|---|\n| BMW 320d | 140000 kr |\n\nUnderlaget räcker inte för att bedöma om det är ett fynd.';const answer=conciseAnswer(input,[{make:'BMW'}]);assert.doesNotMatch(answer,/Hittade 4|\|/);assert.match(answer,/Underlaget räcker inte/);});

test('a fabricated money amount is replaced by a concise conclusion from the actual cars',()=>{const {conciseAnswer}=require('../electron/answer.cjs');const answer=conciseAnswer('Sökresultatet visar fyra BMW under 200 kr.',[{make:'BMW',model:'3-serie',year:2014,price:144900}],{maxPrice:199999});assert.doesNotMatch(answer,/fyra|under 200 kr/);assert.match(answer,/144\s*900/);});

const crypto=require('node:crypto');
const {requestJSON}=require('./services.cjs');const {validateFilters,normalizeListing}=require('./core.cjs');
function text(el){return el.text().replace(/\s+/g,' ').trim();}
function digits(v){const n=Number(String(v).replace(/[^\d]/g,''));return Number.isFinite(n)?n:0;}
function makeName(v){return v==='Mercedes'?'Mercedes-Benz':v==='Škoda'?'Skoda':v;}
function registration(v){v=String(v||'').replace(/[ -]/g,'').toUpperCase();return /^[A-Z0-9]{6,10}$/.test(v)?v:null;}
function vin(v){v=String(v||'').toUpperCase();return /^[A-HJ-NPR-Z0-9]{17}$/.test(v)?v:null;}
function structuredCar($){let car;$('script[type="application/ld+json"]').each((_i,e)=>{try{const v=JSON.parse($(e).text()),values=Array.isArray(v)?v:[v,...(v['@graph']||[])];const found=values.find(x=>x['@type']==='Car'||Array.isArray(x['@type'])&&x['@type'].includes('Car'));if(found)car=found;}catch{}});return car;}
function inactive(d){return /^https:\/\/schema\.org\/(SoldOut|OutOfStock|Discontinued)$/.test(d?.offers?.availability||'');}
function modelName(make,v){if(make==='BMW'&&/^[1-8]\d\d[deix]/i.test(v))return v[0]+'-serie';return v;}
function fuelName(v,title=''){
  if(/plug.?in|laddhybrid|laddbar/i.test(v+' '+title))return 'Laddhybrid';
  if(/hybrid/i.test(v))return 'Hybrid';
  return ({Bensin:'Bensin',Diesel:'Diesel',El:'El','El/Bensin':'Hybrid',Etanol:'Etanol',Gas:'Gas'})[v]||null;
}
function parseBilwebDetail(html,url){
  const $=require('cheerio').load(html);let d;
  $('script[type="application/ld+json"]').each((_i,e)=>{try{const v=JSON.parse($(e).text());const values=Array.isArray(v)?v:[v,...(v['@graph']||[])];const car=values.find(x=>x['@type']==='Car'||x['@type']?.includes('Car'));if(car)d=car;}catch{}});
  if(!d)throw new Error('Bilwebs annonsformat har ändrats. Ingen data ändrades.');
  if(inactive(d))return {inactive:true};
  const make=makeName(d.brand?.name||'');const model=modelName(make,String(d.model||''));const v=d.mileageFromOdometer;
  const mileage=v?.unitCode==='KMT'?Math.round(Number(v.value)/10):/mil/i.test(v?.unitText||'')?Number(v.value):null;
  const fuel=fuelName(d.vehicleEngine?.fuelType,d.vehicleConfiguration);const gearbox=({'Automatisk':'Automat','Automat':'Automat','Manuell':'Manuell'})[d.vehicleTransmission];
  if(!fuel||!gearbox||mileage===null||d.offers?.priceCurrency!=='SEK'||/leasing|\/mån/i.test(d.name))return null;
  let plate=null;$('p').each((_i,e)=>{if(text($(e))==='Reg.nr')plate=text($(e).next('p'));});
  const city=$('[data-region]').first().attr('data-region')||'';
  const config=String(d.vehicleConfiguration||'');const variant=make==='BMW'&&/^\d\d\d/.test(d.model)?String(d.model):config.split(/\s+/).slice(0,2).join(' ');
  return {id:String(d.sku||url.match(/-(\d+)$/)?.[1]||''),title:d.name,make,model,variant:config,comparisonVariant:variant,bodyType:d.bodyType||'',year:Number(d.vehicleModelDate),mileage,fuel,gearbox,price:Number(d.offers.price),url:d.url||url,images:(Array.isArray(d.image)?d.image:[d.image].filter(Boolean)).slice(0,40),seller:d.offers.seller?.name||'',city,vin:vin(d.vehicleIdentificationNumber),registration:registration(plate),description:d.description&&d.description!=='-'?d.description:''};
}
function parseBytbilDetail(html,url){
  const $=require('cheerio').load(html);const fields={};$('.object-info-box dt').each((_i,e)=>{fields[text($(e))]=text($(e).next('dd'));});
  const title=text($('.vehicle-detail-title').first());if(!title||!fields['Märke']||!fields['Modell'])throw new Error('Bytbils annonsformat har ändrats. Ingen data ändrades.');
  const fuel=fuelName(fields.Drivmedel,title);const gearbox=({'Automatisk':'Automat','Automat':'Automat','Manuell':'Manuell'})[fields['Växellåda']];
  const priceText=$('.vehicle-detail-price').first().text();if(/\/\s*mån|per månad|privatleasing/i.test(priceText))return null;const price=digits(priceText);if(!fuel||!gearbox||!price||!fields.Miltal||/leasing|\/mån/i.test(title))return null;
  const make=makeName(fields['Märke']),originalModel=fields['Modell'],model=modelName(make,originalModel);
  const variant=title.replace(new RegExp('^'+fields['Märke'].replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*'+originalModel.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\s*','i'),'');
  const images=[...new Set([...$('meta[property="og:image"]').toArray().map(e=>$(e).attr('content')),...$('.thumbnail-image img').toArray().map(e=>$(e).attr('src'))].filter(u=>u?.startsWith('https://')))].slice(0,40);
  const seller=text($('.dealer-contact-buttons h2 a').first())||text($('.vehicle-detail-dealer-headline a').first());
  const address=text($('.vehicle-detail-section-dealer-map a[href*="hitta.se"]').first());const city=address.includes(',')?address.split(',').at(-1).trim():'';
  const description=text($('.vehicle-detail-equipment-detail[style*="pre-line"]').first())||text($('.vehicle-description').first());
  return {id:url.match(/-(\d+)$/)?.[1]||'',title,make,model,variant,comparisonVariant:make==='BMW'&&/^\d\d\d/.test(originalModel)?originalModel:variant.split(/\s+/).slice(0,2).join(' '),bodyType:fields.Karosseri||'',year:digits(fields['Årsmodell']),mileage:digits(fields.Miltal),fuel,gearbox,price,url,images,seller,city,registration:registration(fields.Regnr),description};
}
function parseWaykeDetail(html,url){
  const $=require('cheerio').load(html),d=structuredCar($);if(!d)throw new Error('Waykes annonsformat har ändrats. Ingen data ändrades.');if(inactive(d))return {inactive:true};
  const fields={};$('dl dt').each((_i,e)=>{fields[text($(e))]=text($(e).next('dd'));});
  const fuel=fuelName(fields.Motortyp||'',d.vehicleConfiguration)||fuelName(fields.Drivmedel||'');
  const gearbox=({'Automat':'Automat','Automatisk':'Automat','Manuell':'Manuell'})[fields['Växellåda']||d.vehicleTransmission];
  const od=d.mileageFromOdometer;const mileage=od?.unitCode==='KMT'?Math.round(Number(od.value)/10):null;
  if(!fuel||!gearbox||mileage===null||d.offers?.priceCurrency!=='SEK')return null;
  const make=makeName(d.brand?.name||''),model=modelName(make,String(d.model||'')),variant=String(d.vehicleConfiguration||'');
  const identities=Array.isArray(d.identifier)?d.identifier:[d.identifier].filter(Boolean);const plate=identities.find(x=>x.propertyID==='registrationNumber')?.value||fields.Registreringsnummer;
  return {id:url.split('/objekt/')[1]?.split('?')[0]||'',title:d.name,make,model,variant,comparisonVariant:make==='BMW'&&/^\d{3}[deix]/i.test(variant)?variant.match(/^\d{3}[deix]+/i)[0]:variant.split(/\s+/).slice(0,2).join(' '),bodyType:fields.Kaross||d.bodyType||'',year:Number(d.vehicleModelDate),mileage,fuel,gearbox,price:Number(d.offers.price),url:d.url||url,images:(Array.isArray(d.image)?d.image:[d.image].filter(Boolean)).slice(0,40),seller:d.offers.seller?.name||fields['Säljare']||'',city:fields['Säljarens plats']||'',vin:vin(d.vehicleIdentificationNumber),registration:registration(plate),description:text($('[data-testid="item-v2-description"]').first()),publishedAt:d.offers.validFrom};
}
function parseDetail(id,html,url){return id==='bilweb'?parseBilwebDetail(html,url):id==='wayke'?parseWaykeDetail(html,url):parseBytbilDetail(html,url);}
function listLinks(html,id){
  const $=require('cheerio').load(html),base=id==='bilweb'?'https://bilweb.se':id==='wayke'?'https://www.wayke.se':'https://www.bytbil.com';
  const links=id==='bilweb'?$('[data-vehicle-id]').toArray().map(e=>$(e).find('a[href]').toArray().map(a=>$(a).attr('href')).find(h=>/\-\d+$/.test(h||''))):id==='wayke'?$('[data-product-card-link][href^="/objekt/"]').toArray().map(e=>$(e).attr('href')):$('.result-list-item .js-link-target').toArray().map(e=>$(e).attr('href'));
  return [...new Set(links.filter(Boolean).map(h=>new URL(h,base).href))].filter(u=>new URL(u).hostname===new URL(base).hostname);
}
function listURL(id,f,make){
  const slug=v=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-');
  const u=new URL(id==='bilweb'?'https://bilweb.se/sok'+(make?'/'+slug(make==='Mercedes-Benz'?'Mercedes':make):''):id==='wayke'?'https://www.wayke.se/sok'+(make?'/'+slug(make):''):'https://www.bytbil.com/bil');
  if(id==='bytbil'){
    if(make)u.searchParams.set('Makes',make==='Skoda'?'Skoda':make);
    for(const [k,p] of [['minPrice','PriceRange.From'],['maxPrice','PriceRange.To'],['minYear','ModelYearRange.From'],['maxYear','ModelYearRange.To'],['maxMileage','MilageRange.To']])if(f[k]!=null)u.searchParams.set(p,String(f[k]));
    if(f.gearbox)u.searchParams.set('Gearboxes',f.gearbox==='Automat'?'Automatisk':'Manuell');
    for(const model of f.models||[])u.searchParams.append('Models',model);
    const fuels={Bensin:['Bensin'],Diesel:['Diesel'],El:['El'],Hybrid:['Elhybrid','Hybrid el/diesel','Hybrid el/bensin'],Laddhybrid:['Laddhybrid'],Etanol:['Bensin/etanol'],Gas:['Bensin/gas','Naturgas']};for(const fuel of f.fuelTypes||[])for(const value of fuels[fuel]||[])u.searchParams.append('Fuels',value);
    if(f.query)u.searchParams.set('FreeText',f.query);u.searchParams.set('SortParams.SortField',f.sort==='priceAsc'||f.sort==='priceDesc'?'price_value':f.sort==='mileage'?'milage':'publishedDate');u.searchParams.set('SortParams.IsAscending',f.sort==='priceAsc'||f.sort==='mileage'?'True':'False');
  }else if(id==='bilweb'){
    for(const [k,p] of [['minPrice','price_min'],['maxPrice','price_max'],['minYear','year_min'],['maxYear','year_max'],['maxMileage','mileage_max']])if(f[k]!=null)u.searchParams.set(p,String(f[k]));
    if(make&&Object.keys(f).length>0)u.searchParams.set('make',make==='Mercedes-Benz'?'Mercedes':make);
    for(const model of f.models||[])u.searchParams.append(/^[1-8]-serie$/i.test(model)?'serie':'model',model.replace(/-serie$/i,'-Serie'));
    if(f.gearbox)u.searchParams.set('transmission',f.gearbox==='Automat'?'Automatisk':'Manuell');
    for(const fuel of f.fuelTypes||[])u.searchParams.append('fuel',fuel);
    if(f.sort==='priceAsc'||f.sort==='priceDesc'){u.searchParams.set('sort_by','price');u.searchParams.set('sort_order',f.sort==='priceAsc'?'asc':'desc');}
    if(f.query)u.searchParams.set('q',f.query);
  }else{
    for(const [k,param] of [['minPrice','price.min'],['maxPrice','price.max'],['minYear','modelYear.min'],['maxYear','modelYear.max'],['maxMileage','odometer.max']])if(f[k]!=null)u.searchParams.set(param,String(f[k]));
    if(f.gearbox)u.searchParams.set('gearboxType',f.gearbox);
    if(f.query)u.searchParams.set('q',f.query);
  }
  return u.href;
}
async function fetchHTMLSource(store,source,filters={}, {request=requestJSON,force=false,maxDetails=24}={}){
  store.checkSource(source);const f=validateFilters(filters),key='htmlscope:'+source.id+':'+crypto.createHash('sha256').update(JSON.stringify(f)).digest('hex');const cached=store.setting(key);if(!force&&cached&&Date.now()-cached.at<30*60000)return {cached:true,...cached};
  const groups=[];for(const make of f.makes?.length?f.makes.slice(0,2):[null]){
    const html=await request(listURL(source.id,f,make),{kind:'html'});const found=listLinks(html,source.id);if(!found.length&&!/0\s+(?:Personbilar|bilar|träffar|resultat)/i.test(html))throw new Error(source.name+'s lista kunde inte läsas. Befintliga annonser behålls.');groups.push(found);
  }
  const links=new Set();for(let i=0;i<24;i++)for(const group of groups)if(group[i])links.add(group[i]);
  const listings=[];let skipped=0;const selected=[...links].slice(0,maxDetails);
  for(const url of selected){const html=await request(url,{kind:'html'});const ad=parseDetail(source.id,html,url);if(!ad||ad.inactive){skipped++;continue;}try{normalizeListing(ad,source);}catch{skipped++;continue;}listings.push(ad);}
  const counts=store.importSnapshot(source,{schemaVersion:1,complete:false,listings});const coverage={...counts,at:Date.now(),received:selected.length,imported:listings.length,skipped};store.setSetting(key,coverage);store.setSetting('coverage:'+source.id,coverage);store.sourceStatus(source.id,null,true);return coverage;
}
async function verifyHTMLSource(store,source,{request=requestJSON,limit=2}={}){
  let removed=0,checked=0;const rows=store.rows('SELECT * FROM listings WHERE source_id=? AND active=1 ORDER BY last_seen LIMIT ?',[source.id,limit]);
  for(const row of rows){const previous=JSON.parse(row.data);try{const html=await request(previous.url,{kind:'html'});const ad=parseDetail(source.id,html,previous.url);if(ad?.inactive){store.removeListing(row.id);removed++;checked++;}else if(ad){store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...ad,publishedAt:previous.publishedAt}]});checked++;}}catch(e){if(e.status===404||e.status===410){store.removeListing(row.id);removed++;}else break;}}
  return {removed,checked};
}
module.exports={parseBilwebDetail,parseBytbilDetail,parseWaykeDetail,listLinks,listURL,fetchHTMLSource,verifyHTMLSource,parseDetail};

const crypto=require('node:crypto');
const {requestJSON}=require('./services.cjs');
const {validateFilters,normalizeListing}=require('./core.cjs');
const brands=require('./blocket-brands.json');
const {cashAmount,saleIssue}=require('./sale-quality.cjs');
const {sourceQuery,normalize}=require('./search-query.cjs');
function originalDescription(html){
 if(typeof html!=='string')return '';
 const $=require('cheerio').load(html),heading=$('h2,h3').filter((_i,e)=>$(e).text().trim()==='Beskrivning').first();
 if(!heading.length)return '';
 const section=heading.closest('section');if(!section.length)return '';
 section.find('script,style,button').remove();section.find('br').replaceWith('\n');section.find('li').prepend('\n• ');heading.remove();
 return section.text().replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim().slice(0,6000);
}
function modelName(d){
  if(d.make==='BMW'&&/^\d+-Serie$/i.test(d.series||''))return d.series.toLowerCase();
  return (d.series||d.model||'Ej angiven').replace(/-Serie$/i,'');
}
function parseCar(d){
  if(!d||!d.id||!d.heading||!d.make||!d.canonical_url)return null;
  if(d.sales_form!=null&&d.sales_form!==1)return null;
  if(d.price?.currency_code!=='SEK'||!Number.isInteger(d.price.amount)||d.price.amount<=100)return null;
  if(/(?:vi köper|köpes|köper din|bilar sökes)/i.test(d.heading+' '+(d.model_specification||'')))return null;
  if(saleIssue({title:d.heading,variant:d.model_specification,price:d.price.amount,priceText:d.price.display||d.price.formatted,pricePeriod:d.price.period,priceType:d.price.type,description:d.description||''}))return null;
  if(!Number.isInteger(d.year)||!Number.isInteger(d.mileage))return null;
  const unit=d.mileage_unit;let mileage=d.mileage;
  if(unit==='KILOMETER'||unit==='KM')mileage=Math.round(mileage/10);
  else if(unit!=='SCANDINAVIAN_MILE')return null;
  const fuelMap={'Bensin':'Bensin','Diesel':'Diesel','El':'El','Plug-in Bensin':'Laddhybrid','Plug-in Diesel':'Laddhybrid','Hybrid bensin':'Hybrid','Hybrid diesel':'Hybrid','El/Bensin':'Laddhybrid','Etanol':'Etanol','Gas':'Gas','Bensin + Etanol':'Etanol','Bensin + Gas':'Gas'};
  const fuel=fuelMap[d.fuel],gearbox=({'Automatisk':'Automat','Automat':'Automat','Manuell':'Manuell'})[d.transmission];if(!fuel||!gearbox)return null;
  const reg=d.regno&&/^[A-Z0-9]{6,10}$/.test(d.regno.replace(/[ -]/g,''))?d.regno:null;
  const vin=d.chassis_number&&/^[A-HJ-NPR-Z0-9]{17}$/.test(d.chassis_number)?d.chassis_number:null;
  const images=(Array.isArray(d.image_urls)?d.image_urls:d.image?.url?[d.image.url]:[]).filter(x=>typeof x==='string'&&x.startsWith('https://')).slice(0,40);
  return {id:String(d.id),title:d.heading,make:d.make,model:modelName(d),variant:d.model_specification||d.model||'',comparisonVariant:d.model||'',bodyType:d.body_type||'',year:d.year,mileage,price:d.price.amount,fuel,gearbox,registration:reg,vin,url:d.canonical_url,city:typeof d.location==='string'?d.location:d.location?.name||'',sellerType:({'Privat':'private','Företag':'dealer'})[d.dealer_segment],seller:d.organisation_name||({'Privat':'Privat säljare','Företag':'Bilhandlare'})[d.dealer_segment]||'',images,publishedAt:d.timestamp?new Date(d.timestamp).toISOString():undefined,description:typeof d.description==='string'?d.description:'',priceText:d.price.display||d.price.formatted,pricePeriod:d.price.period,priceType:d.price.type};
}
function buildURL(filters,page=1){
  const f=validateFilters(filters);const u=new URL('https://blocket-api.se/v1/search/car');u.searchParams.set('page',String(page));u.searchParams.set('sort_order',f.sort==='priceAsc'?'PRICE_ASC':f.sort==='priceDesc'?'PRICE_DESC':f.sort==='relevance'||(!f.sort&&(f.query||f.models?.length))?'RELEVANCE':'PUBLISHED_DESC');
  const token=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
  for(const make of f.makes||[]){const m=token(normalize(make));if(brands.includes(m))u.searchParams.append('models',m);}
  for(const [k,param] of [['minPrice','price_from'],['maxPrice','price_to'],['minYear','year_from'],['maxYear','year_to'],['minMileage','milage_from'],['maxMileage','milage_to']])if(f[k]!=null)u.searchParams.set(param,String(f[k]));
  for(const county of require('./geography.cjs').sourceCounties(f.location))u.searchParams.append('locations',county);
  if(f.gearbox)u.searchParams.append('transmissions',f.gearbox==='Automat'?'AUTOMATIC':'MANUAL');
  const unknown=(f.makes||[]).filter(make=>!brands.includes(token(normalize(make))));const query=[unknown.join(' eller '),sourceQuery(f)].filter(Boolean).join(' ');if(query)u.searchParams.set('query',query);
  return u.href;
}
async function fetchCars(store,source,filters={}, {request=requestJSON,pages=5,force=false}={}){
  store.checkSource(source);const f=validateFilters(filters);const key='scope:'+crypto.createHash('sha256').update(JSON.stringify(f)).digest('hex');const cached=store.setting(key);
  if(!force&&cached&&Date.now()-cached.at<15*60000)return {cached:true,...cached};
  const all=new Map();let total=0,received=0,skipped=0;const reasons={};
  for(let page=1;page<=pages;page++){
    const r=await request(buildURL(f,page));if(!Array.isArray(r.docs))throw new Error('BlocketAPI returnerade ett oväntat sökformat.');
    total=r.metadata?.result_size?.match_count??r.total??total;received+=r.docs.length;
    for(const d of r.docs){try{const ad=parseCar(d);if(!ad){skipped++;reasons['Ej komplett kontantannons']=(reasons['Ej komplett kontantannons']||0)+1;continue;}normalizeListing(ad,source);all.set(ad.id,ad);}catch{skipped++;reasons['Ogiltiga källuppgifter']=(reasons['Ogiltiga källuppgifter']||0)+1;}}
    if(!r.docs.length||r.metadata?.is_end_of_paging||page>=(r.metadata?.paging?.last||Infinity))break;
  }
  for(const ad of all.values()){const previous=store.rows('SELECT data FROM listings WHERE id=?',[source.id+':'+ad.id])[0];if(previous&&!ad.description)ad.description=JSON.parse(previous.data).description||'';}
  const counts=store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[...all.values()]});
  const coverage={at:Date.now(),total,received,imported:all.size,skipped,reasons,...counts};store.setSetting(key,coverage);store.setSetting('blocketCoverage',coverage);store.sourceStatus(source.id,null,true);return coverage;
}
async function verifyKnown(store,source,{request=requestJSON,limit=5}={}){
  const rows=store.rows('SELECT * FROM listings WHERE source_id=? AND active=1 ORDER BY last_seen LIMIT ?',[source.id,limit]);let removed=0,checked=0;
  for(const row of rows){const ad=JSON.parse(row.data);
    try{const r=await request('https://blocket-api.se/v1/ad/car?id='+encodeURIComponent(ad.id));
      // A failed parser or empty response is not evidence of a deletion.
      if(r.ad_id!==String(ad.id)&&String(r.ad_id)!==String(ad.id))continue;
      if(!r.title||!r.price)continue;
      const price=cashAmount(r.price);if(!price||saleIssue({...ad,title:r.title,price:price||ad.price,priceText:r.price})){store.excludeListing(row.id);checked++;continue;}const mileage=/mil/.test(r.mileage||'')?Number(String(r.mileage).replace(/[^0-9]/g,'')):ad.mileage;
      store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...ad,title:r.title,price,priceText:String(r.price),mileage,description:r.equipment?.length?'Utrustning enligt annonsen:\n'+r.equipment.join(' · '):ad.description}]});checked++;
    }catch(e){if(e.status===404||e.status===410){store.removeListing(row.id);removed++;}else break;}
  }return {removed,checked};
}
module.exports={parseCar,buildURL,fetchCars,verifyKnown,modelName,originalDescription};

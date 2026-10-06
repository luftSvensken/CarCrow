const cheerio=require('cheerio');
function riddermarkPage(html){
 const $=cheerio.load(html);let data;try{data=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.carsJson;data=typeof data==='string'?JSON.parse(data):data;}catch{throw new Error('Riddermarks annonsformat har ändrats.');}
 if(!Array.isArray(data))throw new Error('Riddermarks annonslista kunde inte läsas.');
 const links=$('a[href]').toArray().map(e=>$(e).attr('href'));
 const listings=data.filter(car=>!car.isSold&&!car.isBeingPriced&&!car.isTransportVehicle).flatMap(car=>{
  const gear={Automatisk:'Automat',Automat:'Automat',Manuell:'Manuell'}[car.gearboxType];
  const fuel=/laddhybrid/i.test(car.fuelType)?'Laddhybrid':/hybrid/i.test(car.fuelType)?'Hybrid':({Bensin:'Bensin',Diesel:'Diesel',El:'El',Etanol:'Etanol',Gas:'Gas'})[car.fuelType];
  const link=links.find(url=>new RegExp('/'+String(car.licenseplate).toLowerCase()+'/?$','i').test(url));
  if(!gear||!fuel||!link||!Number.isInteger(car.price)||car.price<=0||!Number.isInteger(car.mileage))return [];
  return [{id:String(car.id),title:car.title,make:car.make,model:car.series||car.model,variant:car.modelDescription||'',comparisonVariant:car.model,bodyType:car.carType||'',year:car.modelYear,mileage:car.mileage,price:car.price,fuel,gearbox:gear,url:new URL(link,'https://www.riddermarkbil.se').href,images:[...new Set([car.coverImage,...(car.images||[]).filter(x=>x.type===1).sort((a,b)=>a.position-b.position).map(x=>x.url)].filter(Boolean))].slice(0,40),city:car.physicalLocation?.name||car.location?.name||'',seller:'Riddermark Bil',registration:car.licenseplate,vin:car.vinNumber,description:'',publishedAt:car.publishedAt}];
 });
 return {listings,count:data.length};
}
function riddermarkDetail(html,url){
 const $=cheerio.load(html);let car;try{car=JSON.parse($('#__NEXT_DATA__').text()).props.pageProps.advertJson;car=typeof car==='string'?JSON.parse(car):car;}catch{throw new Error('Riddermarks originalannons kunde inte läsas.');}
 if(car?.isSold)return {inactive:true};if(!car||car.isBeingPriced)return null;
 const copy={...car,coverImage:car.images?.find(x=>x.type===1&&x.position===0)?.url};
 const encoded=JSON.stringify({props:{pageProps:{carsJson:[copy]}}}).replace(/</g,'\\u003c');
 const parsed=riddermarkPage('<script id="__NEXT_DATA__">'+encoded+'</script><a href="'+url+'">Annons</a>');
 const ad=parsed.listings[0];return ad?{...ad,url,description:car.fullText||car.equipment?.map(x=>x.description).join(' · ')||''}:null;
}
function riddermarkURL(filters,page=1,make){const u=new URL('https://www.riddermarkbil.se/kopa-bil/');u.searchParams.set('forSale','true');u.searchParams.set('incoming','false');u.searchParams.set('page',String(page));if(make)u.searchParams.set('brands',make);if(filters.models?.length)u.searchParams.set('series',filters.models.join(','));if(filters.query)u.searchParams.set('search',filters.query);return u.href;}
function parseKvdDetail(html,url){
 const $=cheerio.load(html);let d;$('script[type="application/ld+json"]').each((_i,e)=>{try{const x=JSON.parse($(e).text());if(['Vehicle','Car'].includes(x['@type']))d=x;}catch{}});
 if(!d)throw new Error('Kvdbils annonsformat har ändrats.');
 if(/SoldOut|OutOfStock|Discontinued/.test(d.offers?.availability||''))return {inactive:true};
 // Read only an explicit fixed-price offer or the site's labelled purchase box.
 // AggregateOffer.lowPrice is a bid, and dealer estimates are never sale prices.
 const offer=d.offers;let fixed=offer?.['@type']==='Offer'?Number(offer.price):null;
 if(!fixed){$('span').filter((_i,e)=>$(e).text().trim()==='Fast pris').each((_i,e)=>{const box=$(e).parent().parent();if(!/BuyMethodContainer/.test(box.attr('class')||'')||!box.text().includes('Köp till fast pris'))return;const match=box.text().match(/Fast pris inkl\. moms\s*([\d \u00a0\u202f]+) kr/);if(match)fixed=Number(match[1].replace(/\s/g,''));});}
 if(offer?.priceCurrency!=='SEK'||!Number.isInteger(fixed)||fixed<=0)return null;
 const fuel=({Bensin:'Bensin',Diesel:'Diesel',El:'El',Laddhybrid:'Laddhybrid',Hybrid:'Hybrid',Etanol:'Etanol',Gas:'Gas'})[d.fuelType];const gearbox=({Automat:'Automat',Manuell:'Manuell'})[d.vehicleTransmission];
 if(!fuel||!gearbox||d.mileageFromOdometer?.unitCode!=='KMT')return null;
 const make=d.brand?.name,model=d.model;let plate='';$('li').each((_i,e)=>{if($(e).find('span').first().text().trim()==='Registreringsnummer')plate=$(e).find('span').last().text().trim();});
 return {id:url.match(/-(\d+)$/)?.[1],title:d.name,make,model:make==='BMW'?model.replace(/-serien/i,'-serie'):model,variant:d.description||'',comparisonVariant:d.description||'',bodyType:d.bodyType||'',year:Number(d.vehicleModelDate),mileage:Math.round(Number(d.mileageFromOdometer.value)/10),price:fixed,fuel,gearbox,url,images:(d.image||[]).slice(0,40),registration:plate||null,vin:d.vehicleIdentificationNumber,city:offer.seller?.address?.addressLocality||'',seller:'Kvdbil',description:(d.additionalProperty||[]).map(x=>x.name+': '+x.value).join('\n')};
}
function kvdURL(filters,page=1,make){
 const url=new URL('https://api.kvd.se/v1/auction/search');
 for(const [key,value] of Object.entries({auctionType:'BUY_NOW',orderBy:'-grade',vehicleType:'car',limit:20,offset:(page-1)*20}))url.searchParams.set(key,String(value));
 if(make)url.searchParams.set('brand',make);
 return url.href;
}
function kvdPage(data){
 if(!Array.isArray(data.auctions))throw new Error('Kvdbils sökformat har ändrats.');
 const listings=data.auctions.flatMap(a=>{
  const p=a.processObject?.properties;
  // A bid, reserve price or estimated value must never become a sale price.
  if(!p||a.auctionType!=='BUY_NOW'||!a.buyNowAvailable||a.state!=='OPEN'||a.closedAt||a.currency!=='SEK'||!Number.isInteger(a.buyNowAmount)||a.buyNowAmount<=0||p.saleLimitedToCorporate||p.mustExport||p.odometerUnit!=='km')return [];
  const codes=(p.fuels||[]).map(f=>f.fuelCode),electric=String(p.electricType||'');
  const fuel=/plugin|plug.in|phev/i.test(electric)?'Laddhybrid':/hybrid/i.test(electric)?'Hybrid':codes.includes('Electric')&&codes.some(c=>c==='Petrol'||c==='Diesel')?'Laddhybrid':codes.includes('Electric')?'El':({Petrol:'Bensin',Diesel:'Diesel',Ethanol:'Etanol',NaturalGas:'Gas'})[codes[0]];
  const gearbox=({Automatic:'Automat',Manual:'Manuell'})[p.gearbox];
  if(!fuel||!gearbox||!Number.isFinite(p.odometerReading)||!p.familyName)return [];
  const fee=Number(a.mediationFee),description=Number.isFinite(fee)&&fee>0?'Köparavgift tillkommer enligt Kvdbil: '+fee.toLocaleString('sv-SE')+' kr.':'';
  const base=a.processObject.baseObject;
  return [{id:String(a.id),title:p.adHeader||p.title,make:p.brand,model:p.brand==='BMW'?p.familyName.replace(/-serien/i,'-serie'):p.familyName,variant:p.modelName||'',comparisonVariant:p.modelName||'',bodyType:({Hatchback:'Halvkombi',StationWagon:'Kombi',Sedan:'Sedan',SUV:'SUV',Coupe:'Coupé',Convertible:'Cabriolet'})[p.body]||p.body||'',year:Number(p.modelYear),mileage:Math.round(p.odometerReading/10),price:a.buyNowAmount,fuel,gearbox,url:a.auctionUrl,images:(a.previewImages||[]).map(i=>i.uri).filter(Boolean).slice(0,40),registration:p.registrationPlate,vin:base?.vin,city:a.processObject.locationInfo?.facility?.city||'',seller:'Kvdbil',description,publishedAt:a.publishedAt}];
 });
 return {listings,count:data.auctions.length,total:data.hits};
}
module.exports={riddermarkPage,riddermarkDetail,riddermarkURL,parseKvdDetail,kvdPage,kvdURL};

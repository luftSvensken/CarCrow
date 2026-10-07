const crypto=require('node:crypto'),cheerio=require('cheerio');
const {requestJSON}=require('./services.cjs');
const {normalizeListing,httpsURL}=require('./core.cjs');
const {normalize,makes}=require('./search-query.cjs');
const text=v=>String(v??'').replace(/\s+/g,' ').trim();
const name=v=>typeof v==='string'?v:text(v?.name);
function numeric(v){if(typeof v==='number')return Number.isFinite(v)?v:null;if(typeof v!=='string'||!v.trim())return null;const n=Number(v.replace(/\s|kr|SEK/gi,'').replace(',','.'));return Number.isFinite(n)?n:null;}
function parseWebListing(html,url){
 const u=new URL(httpsURL(url));if(/(^|\.)(?:bilweb\.se|facebook\.com)$/.test(u.hostname))return null;
 if(/(?:^|\.)bytbil\.com$/.test(u.hostname)&&/-\d+$/.test(u.pathname)){try{const ad=require('./html-sources.cjs').parseBytbilDetail(html,url);if(ad)return {...ad,id:crypto.createHash('sha256').update(u.href).digest('hex').slice(0,32),webDiscovered:true,webSourceName:'Bytbil',verifiedAt:new Date().toISOString()};}catch{return null;}}
 const $=cheerio.load(html);if(/captcha|verify you are human|access denied|just a moment/i.test($('title').text()))return null;
 const nodes=[];const walk=value=>{if(Array.isArray(value))return value.forEach(walk);if(!value||typeof value!=='object')return;nodes.push(value);if(value['@graph'])walk(value['@graph']);};
 $('script[type="application/ld+json"]').each((_i,e)=>{try{walk(JSON.parse($(e).text()));}catch{}});
 const cars=nodes.filter(d=>[d['@type']].flat().some(t=>['Car','Vehicle','Product'].includes(t))&&d.offers);
 if(cars.length!==1)return null;const d=cars[0];if(![d['@type']].flat().some(t=>['Car','Vehicle'].includes(t))&&!d.vehicleModelDate&&!d.mileageFromOdometer&&!d.vehicleTransmission)return null;const offer=Array.isArray(d.offers)?d.offers[0]:d.offers;
 if(!offer||offer.priceCurrency!=='SEK'||/SoldOut|OutOfStock|Discontinued/i.test(offer.availability||''))return null;
 const price=numeric(offer.price??offer.priceSpecification?.price),title=text(d.name||$('h1').first().text());
 if(!Number.isInteger(price)||price<=100||!title||/leasing|\/(?:\s*mån)|per månad|vi köper|köpes/i.test(title+' '+text(offer.description)+' '+text(offer.priceSpecification?.unitText)))return null;
 const fields={};for(const prop of [d.additionalProperty||[]].flat())if(prop?.name)fields[normalize(prop.name)]=prop.value;
 $('dt').each((_i,e)=>{fields[normalize($(e).text())]=text($(e).next('dd').text());});$('tr').each((_i,e)=>{const cells=$(e).find('th,td');if(cells.length===2)fields[normalize(cells.eq(0).text())]=text(cells.eq(1).text());});
 let make=name(d.brand)||text(fields.marke),model=name(d.model)||text(fields.modell);
 if(!make)make=makes.find(m=>normalize(title).startsWith(normalize(m)+' '))||'';
 if(make&&!model){const heading=normalize(title),brand=normalize(make);if(heading.startsWith(brand+' ')){const tail=title.split(/\s+/).slice(make.split(/\s+/).length);model=tail[0]||'';}}
 if(!make||!model||model.length>100)return null;
 let year=numeric(String(d.vehicleModelDate||fields.arsmodell||'').slice(0,4));if(!Number.isInteger(year)||year<1900||year>2100)year=null;
 const od=d.mileageFromOdometer;let mileage=null;
 if(od){const n=numeric(od.value);if(n!=null&&/^(?:KMT|KM)$/i.test(od.unitCode||''))mileage=Math.round(n/10);else if(n!=null&&/^(?:mil|svenska mil)$/i.test(od.unitText||''))mileage=Math.round(n);}
 if(mileage==null&&fields.miltal){const match=String(fields.miltal).match(/^(\d[\d\s]*)\s*(mil|km)?$/i);if(match){mileage=Number(match[1].replace(/\s/g,''));if(match[2]==='km')mileage=Math.round(mileage/10);}}
 if(!Number.isInteger(mileage)||mileage<0||mileage>1000000)mileage=null;
 const fuelRaw=text(d.fuelType||d.vehicleEngine?.fuelType||fields.drivmedel||fields.bransle).toLowerCase();const fuel=/plug.?in|laddhybrid/.test(fuelRaw)?'Laddhybrid':/hybrid/.test(fuelRaw)?'Hybrid':/bensin|petrol|gasoline/.test(fuelRaw)?'Bensin':/diesel/.test(fuelRaw)?'Diesel':/^(?:el|electric)$/.test(fuelRaw)?'El':/etanol/.test(fuelRaw)?'Etanol':/^(?:gas|cng)$/.test(fuelRaw)?'Gas':null;
 const gear=text(d.vehicleTransmission||fields.vaxellada).toLowerCase(),gearbox=/automat|automatic/.test(gear)?'Automat':/manuell|manual/.test(gear)?'Manuell':null;
 const imageList=[d.image||[]].flat().map(i=>typeof i==='string'?i:i?.url).filter(Boolean),images=[];for(const image of imageList.slice(0,40)){try{images.push(httpsURL(new URL(image,url).href));}catch{}}
 const seller=[offer.seller||d.seller].flat()[0],city=text(seller?.address?.addressLocality||d.address?.addressLocality||fields.ort||fields.plats);
 $('script,style,nav,header,footer,aside').remove();const equipment=[d.additionalProperty||[]].flat().filter(p=>/^(?:equipment|utrustning)$/i.test(p?.name||'')).map(p=>text(p.value)).filter(Boolean);const description=[text(d.description||$('main').text()),equipment.length?'Utrustning enligt annonsen: '+equipment.join(' · '):''].filter(Boolean).join('\n').slice(0,6000);
 const identities=[d.identifier||[]].flat();const vin=text(d.vehicleIdentificationNumber),plate=text(fields.regnr||fields.registreringsnummer||fields.registrationnumber||identities.find(i=>i.propertyID==='registrationNumber')?.value).replace(/[ -]/g,'').toUpperCase();
 if(require('./sale-quality.cjs').saleIssue({title,price,description}))return null;
 return {id:crypto.createHash('sha256').update(u.href).digest('hex').slice(0,32),title,make,model,price,year,mileage,fuel,gearbox,url:u.href,city,seller:name(seller),sellerType:seller&&/Organization|AutoDealer/.test(seller['@type']||'')?'dealer':undefined,variant:text(d.vehicleConfiguration),bodyType:text(d.bodyType||fields.kaross),description,images,webDiscovered:true,webSourceName:text(seller?.name)||u.hostname.replace(/^www\./,''),verifiedAt:new Date().toISOString(),vin:/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)?vin:undefined,registration:/^[A-Z0-9]{6,10}$/.test(plate)?plate:undefined};
}
function listingLinks(html,url){
 const $=cheerio.load(html),origin=new URL(url).origin;const links=[];
 const add=value=>{if(typeof value!=='string')return;try{const u=new URL(value,url);if(u.origin===origin&&u.href!==url&&u.protocol==='https:'&&!/bilweb\.se|facebook\.com/.test(u.hostname)&&!links.includes(u.href))links.push(u.href);}catch{}};
 const scan=value=>{if(Array.isArray(value))return value.forEach(scan);if(!value||typeof value!=='object')return;if([value['@type']].flat().some(t=>['Car','Vehicle','Product'].includes(t))&&value.offers&&value.url)add(value.url);if([value['@type']].flat().includes('ItemList')&&value.itemListElement)for(const item of value.itemListElement)add(item.item?.url||item.url||item.item);if(value['@graph'])scan(value['@graph']);};
 $('script[type="application/ld+json"]').each((_i,e)=>{try{scan(JSON.parse($(e).text()));}catch{}});
 const host=new URL(url).hostname;if(/wayke\.se$/.test(host))for(const link of require('./html-sources.cjs').listLinks(html,'wayke'))add(link);if(/bytbil\.com$/.test(host))for(const link of require('./html-sources.cjs').listLinks(html,'bytbil'))add(link);
 $('a[href]').each((_i,e)=>{const a=$(e),href=a.attr('href');if(!href||!/\/(?:objekt|object|mobility\/item|offer|car|fordon|detalj|bilar-till-salu)\/.+/i.test(href))return;const context=text(a.closest('article').text()||a.parent().text());if(/\bkr\b|\bmil\b/i.test(context)&&a.find('img').length)add(href);});return links.slice(0,3);
}
class WebListings{
 constructor({store,web,request=requestJSON}){Object.assign(this,{store,web,request});}
 async find(query,filters,{signal}={}){
  const results=await this.web.search(query,{signal,mode:'listings'}),imported=[],errors=[],visited=new Set();let detailReads=0;
  const read=async url=>{if(visited.has(url))return null;visited.add(url);const host=new URL(url).hostname;if(/(^|\.)(bilweb\.se|facebook\.com)$/.test(host))return null;
   const html=await this.request(url,{kind:'html',maxBytes:3*1024*1024,timeout:15000,signal});return {html,ad:parseWebListing(html,url)};
  };
  const accept=(ad,url)=>{const host=new URL(url).hostname;const source={id:'web:'+host,name:ad.webSourceName,hosts:[host],enabled:true,mediaAllowed:true,webVerified:true,retentionDays:7};normalizeListing(ad,source);this.store.setSource(source);this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[ad]});const row=this.store.rows('SELECT vehicle_id FROM listings WHERE id=?',[source.id+':'+ad.id])[0];if(row)imported.push(row.vehicle_id);};
  let index=0;await Promise.all(Array.from({length:Math.min(3,results.sources.length)},async()=>{while(index<results.sources.length){const result=results.sources[index++];if(signal?.aborted){const e=new Error('Sökningen avbröts.');e.name='AbortError';throw e;}
   try{const page=await read(result.url);if(!page)continue;if(page.ad){accept(page.ad,result.url);continue;}
    // Search engines often return a seller's model page. Follow a bounded set
    // of its real same-origin ad links once, using ordinary public access.
    for(const url of listingLinks(page.html,result.url)){if(detailReads>=8)break;detailReads++;try{const detail=await read(url);if(detail?.ad)accept(detail.ad,url);}catch(e){if(e.name==='AbortError')throw e;errors.push({url,error:e.message});}}
   }catch(e){if(e.name==='AbortError')throw e;errors.push({url:result.url,error:e.message});}
  }}));
  const cars=this.store.search(filters,false,0,false,imported).items;
  return {cars,verifiedCount:cars.length,readAt:new Date().toISOString(),unavailablePages:errors,note:'Endast uppgifter som kunde läsas i originalannonsen importeras. Saknade uppgifter är okända och uppfyller inte hårda filter. Webbträffar med osäkert annonsformat visas inte.'};
 }
}
module.exports={WebListings,parseWebListing,listingLinks};

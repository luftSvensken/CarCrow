const data=require('./swedish-places.json');
const normalize=s=>String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const display={Gothenburg:'Göteborg'};
const names=new Map();
const places=data.places.map(p=>({...p,label:display[p.name]||p.name,keys:[...new Set([p.name,...p.aliases].map(normalize))]}));
for(const p of places)for(const key of p.keys)if(!names.has(key))names.set(key,p);
function resolvePlace(value){
 const exact=normalize(String(value||'').replace(/^\s*\d{3}\s?\d{2}\s+/, '')).replace(/\s+(?:kommun|sverige)$/,'');if(names.has(exact))return names.get(exact);
 for(const part of String(value||'').split(/[,/()]/)){const p=names.get(normalize(part).replace(/\s+kommun$/,''));if(p)return p;}
 return null;
}
function publicPlace(p){return {placeId:p.id,label:p.label,latitude:p.latitude,longitude:p.longitude,precision:'town'};}
function lookupPlaces(query='',limit=12){const q=normalize(query);return places.filter(p=>!q||p.keys.some(k=>k.startsWith(q)||k.includes(' '+q))).slice(0,Math.min(30,Math.max(1,limit))).map(publicPlace);}
function distanceKm(aLat,aLon,bLat,bLon){
 if([aLat,aLon,bLat,bLon].some(x=>typeof x!=='number'||!Number.isFinite(x)))return null;
 const radians=n=>n*Math.PI/180,lat=radians(bLat-aLat),lon=radians(bLon-aLon);
 const h=Math.sin(lat/2)**2+Math.cos(radians(aLat))*Math.cos(radians(bLat))*Math.sin(lon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
function nearestPlace(latitude,longitude){let best=null,km=Infinity;for(const p of places){const d=distanceKm(latitude,longitude,p.latitude,p.longitude);if(d<km){best=p;km=d;}}return best?{...publicPlace(best),distanceKm:km}:null;}
function listingPlace(ad){
 if(Number.isFinite(ad.latitude)&&Number.isFinite(ad.longitude)&&Math.abs(ad.latitude)<=90&&Math.abs(ad.longitude)<=180)return {latitude:ad.latitude,longitude:ad.longitude,precision:'listing'};
 const p=resolvePlace(ad.city);return p?{latitude:p.latitude,longitude:p.longitude,precision:'town'}:null;
}
function validateLocation(raw){
 if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).some(k=>!['label','latitude','longitude','radiusKm','placeId','precision'].includes(k)))throw new Error('Ogiltigt platsfilter.');
 const label=typeof raw.label==='string'?raw.label.trim().slice(0,100):'';if(!label)throw new Error('Välj en ort som utgångspunkt.');
 const place=raw.latitude==null&&raw.longitude==null?resolvePlace(label):null;
 const latitude=raw.latitude??place?.latitude,longitude=raw.longitude??place?.longitude;
 if(!Number.isFinite(latitude)||Math.abs(latitude)>90||!Number.isFinite(longitude)||Math.abs(longitude)>180)throw new Error('Ortens position kunde inte verifieras. Välj en ort i listan.');
 const out={label,latitude,longitude};if(raw.radiusKm!=null){if(!Number.isInteger(raw.radiusKm)||raw.radiusKm<1||raw.radiusKm>2500)throw new Error('Avståndet måste vara 1–2 500 km.');out.radiusKm=raw.radiusKm;}
 return out;
}
// Exact device coordinates stay on the computer. AI only receives the chosen
// town and radius; numeric distance calculations happen against the local index.
function aiFilters(filters){const out={...filters};if(out.location)out.location={label:out.location.label,...(out.location.radiusKm?{radiusKm:out.location.radiusKm}:{})};return out;}
module.exports={normalizePlace:normalize,resolvePlace,lookupPlaces,distanceKm,nearestPlace,listingPlace,validateLocation,aiFilters};

// County bounding boxes enclose the gazetteer's actual towns. They are a broad
// source prefilter only; the local radius test uses each ad's real town point.
const countyBoxes=new Map();for(const p of places){if(!p.county)continue;const key=normalize(p.county).toUpperCase().replace(/ /g,'_'),b=countyBoxes.get(key)||{minLat:90,maxLat:-90,minLon:180,maxLon:-180};b.minLat=Math.min(b.minLat,p.latitude);b.maxLat=Math.max(b.maxLat,p.latitude);b.minLon=Math.min(b.minLon,p.longitude);b.maxLon=Math.max(b.maxLon,p.longitude);countyBoxes.set(key,b);}
function sourceCounties(location){if(!location?.radiusKm)return [];return [...countyBoxes].filter(([_id,b])=>distanceKm(location.latitude,location.longitude,Math.max(b.minLat,Math.min(b.maxLat,location.latitude)),Math.max(b.minLon,Math.min(b.maxLon,location.longitude)))<=location.radiusKm+5).map(([id])=>id);}
module.exports.sourceCounties=sourceCounties;

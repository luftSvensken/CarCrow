const {normalize,makes}=require('./search-query.cjs');
const {validateFilters}=require('./core.cjs');
const modelNames=['V40','V50','V60','V70','V90','S40','S60','S80','S90','XC40','XC60','XC70','XC90','Jazz','Civic','Accord','CR-V','Fit','Mazda 2','Mazda 3','Mazda 6','MX-5','Yaris','Corolla','Auris','Avensis','RAV4','Golf','Passat','Polo','Tiguan','Touran','Octavia','Fabia','Superb','Focus','Fiesta','Mondeo','Model 3','Model Y','A1','A3','A4','A5','A6','Q3','Q5','Q7','9-3','9-5'];
function hasPhrase(text,phrase){return (' '+normalize(text)+' ').includes(' '+normalize(phrase)+' ');}
function explicitMakes(text){const found=makes.filter(m=>hasPhrase(text,m));return found.filter(m=>!new RegExp('(?:inte(?: ha)?|ingen|inga|utom) '+normalize(m)+'\\b').test(normalize(text)));}
function explicitModels(text,facets=[]){
 const found=[...new Set([...modelNames,...facets.map(m=>m.model)])].filter(m=>hasPhrase(text,m));
 for(const match of normalize(text).matchAll(/\b([1-8])\s*serie\b/g))found.push(match[1]+'-serie');
 // A numbered BMW badge is a model, not a minimum model year or budget.
 for(const match of normalize(text).matchAll(/\b([1-8]\d{2}[diex]+)\b/g))found.push(match[1]);
 return [...new Set(found)].filter(m=>!new RegExp('(?:inte(?: ha)?|ingen|inga|utom) '+normalize(m)+'\\b').test(normalize(text)));
}
function explicitBounds(text){
 const bounds={};
 for(const match of text.toLowerCase().matchAll(/\b(under|max|högst|upp till|mindre än|budget(?: på| är)?|för högst)\s+(\d(?:[\d \u00a0\u202f]*\d)?)(?:\s*(tusen|k)(?![a-z]))?\s*(kr|kronor|sek|mil|km)?/gu)){
  let n=Number(match[2].replace(/\s/g,''))*(match[3]?1000:1);const unit=match[4],strict=['under','mindre än'].includes(match[1]);
  if(unit==='mil'||unit==='km'){if(unit==='km')n=Math.floor(n/10);bounds.maxMileage=Math.max(0,n-(strict?1:0));}
  else if(['kr','kronor','sek'].includes(unit)||(!unit&&n>=10000))bounds.maxPrice=Math.max(0,n-(strict?1:0));
 }
 const budgetReply=text.trim().match(/^(?:cirka|ungefär|runt|kring)?\s*(\d[\d \u00a0\u202f]*)(?:\s*(k|tusen))?\s*(?:kr|kronor|sek)?[.!]?$/i);if(budgetReply){const n=Number(budgetReply[1].replace(/\s/g,''))*(budgetReply[2]?1000:1);if(n>=1000)bounds.maxPrice=n;}
 const year=text.match(/\b(?:från|tidigast|årsmodell(?: från)?)\s+(19\d{2}|20\d{2})\b/i);if(year)bounds.minYear=Number(year[1]);
 const maxYear=text.match(/\b(?:till|senast)\s+(19\d{2}|20\d{2})\b/i);if(maxYear)bounds.maxYear=Number(maxYear[1]);
 return validateFilters(bounds);
}
function explicitLocation(text){
 const geo=require('./geography.cjs');for(const match of text.matchAll(/\b(?:i|nära|kring|runt|omkring|från)\s+([A-Za-zÅÄÖåäöÉé][A-Za-zÅÄÖåäöÉé -]{1,60})/gu)){
  const words=match[1].split(/\s+(?:under|max|och|med|automat|manuell|bensin|diesel|för)\b/i)[0].trim().split(/\s+/);for(let n=Math.min(4,words.length);n>0;n--){const place=geo.resolvePlace(words.slice(0,n).join(' '));if(place){const radius=text.match(/\binom\s+(\d+)\s*(km|mil)\b/i);return {label:place.label,latitude:place.latitude,longitude:place.longitude,...(radius?{radiusKm:Number(radius[1])*(radius[2].toLowerCase()==='mil'?10:1)}:{})};}}
 }return null;
}
function userIntent(texts,ui={},facets=[]){
 const out={...ui};
 for(const text of texts){
  const location=explicitLocation(text);if(location){out.location=location;if(/nära|närmast|närheten/i.test(text))out.sort='distance';}
  const brands=explicitMakes(text),models=explicitModels(text,facets);
  if(/alla modeller|andra modeller|modellen spelar ingen roll/i.test(text))delete out.models;
  if(/(?:ingen|utan) (?:prisgräns|budgetgräns)|oavsett pris/i.test(text)){delete out.maxPrice;delete out.minPrice;}
  if(/(?:manuell eller automat|automat eller manuell|växellåda spelar ingen roll|alla växellådor)/i.test(text))delete out.gearbox;
  if(/(?:miltal spelar ingen roll|ingen milgräns)/i.test(text)){delete out.maxMileage;delete out.minMileage;}
  if(/(?:årsmodell spelar ingen roll|alla årsmodeller)/i.test(text)){delete out.minYear;delete out.maxYear;}
  const negative=normalize(text),rejectedModels=(out.models||[]).filter(m=>new RegExp('(?:inte(?: ha)?|ingen|inga|utom) '+normalize(m)+'\\b').test(negative));if(rejectedModels.length){out.models=out.models.filter(m=>!rejectedModels.includes(m));if(!out.models.length)delete out.models;}
  if(brands.length){if(JSON.stringify(brands)!==JSON.stringify(out.makes))delete out.query;out.makes=brands;delete out.models;}
  if(models.length){if(JSON.stringify(models)!==JSON.stringify(out.models))delete out.query;out.models=models;}
  const specifics=text.match(/\b(?:business(?: edition)?|summum|momentum|inscription|dragkrok|panoramatak|skinn|m[- ]sport|r[- ]design)\b/gi);if(specifics?.length)out.query=specifics.join(' ');
  Object.assign(out,explicitBounds(text));
  if(!/manuell eller automat|automat eller manuell|växellåda spelar ingen roll/i.test(text)&&/\bautomat(?:isk)?\b/i.test(text))out.gearbox='Automat';else if(!/manuell eller automat|automat eller manuell|växellåda spelar ingen roll/i.test(text)&&/\bmanuell\b/i.test(text))out.gearbox='Manuell';
  const fuels=['Bensin','Diesel','El','Laddhybrid','Hybrid','Etanol','Gas'].filter(f=>new RegExp('\\b'+f+'(?:bil|bilar)?\\b','i').test(text));if(fuels.length){const rejected=fuels.filter(f=>new RegExp('(?:inte|ingen|inga|utan) '+normalize(f)+'\\b').test(normalize(text)));const positive=fuels.filter(f=>!rejected.includes(f));out.fuelTypes=positive.length?positive:require('./filters.cjs').FUELS.filter(f=>!rejected.includes(f));}
  if(/lägre miltal|låg(?:t|a)? miltal|färre mil/i.test(text))out.sort='mileage';
  if(/billig|lägre pris|lägst pris|första bil/i.test(text))out.sort='priceAsc';
  if(/(?:alla märken|vilket märke som helst|spelar ingen roll.*märke)/i.test(text)){delete out.makes;delete out.models;}
  if(/(?:alla bränslen|bränsle spelar ingen roll)/i.test(text))delete out.fuelTypes;
 }
 return validateFilters(out);
}
function groundedFilters(proposed,intent,texts){
 // The model may plan, but only the user's words or selected controls impose
 // hard restrictions. "Reliable first car" must not silently mean Honda 2010+.
 const result={...intent},evidence=normalize(texts.join(' '));
 if(proposed.query){const q=normalize(proposed.query),tokens=q.split(' ').filter(Boolean);if(tokens.length&&tokens.every(t=>(' '+evidence+' ').includes(' '+t+' ')))result.query=proposed.query;}
 if(require('./filters.cjs').SORTS.includes(proposed.sort)&&!intent.sort)result.sort=proposed.sort;
 if(result.query&&!result.sort)result.sort='relevance';
 return validateFilters(result);
}
function manualIntent(raw){
 const f=validateFilters(raw),query=f.query||'';if(!query)return f;const bounds=explicitBounds(query);Object.assign(f,bounds);
 if(/\bautomat(?:isk)?\b/i.test(query))f.gearbox='Automat';else if(/\bmanuell\b/i.test(query))f.gearbox='Manuell';
 const fuels=['Bensin','Diesel','El','Laddhybrid','Hybrid','Etanol','Gas'].filter(fuel=>new RegExp('\\b'+fuel+'(?:bil|bilar)?\\b','i').test(query));if(fuels.length)f.fuelTypes=fuels;
 const location=explicitLocation(query);if(location)f.location=location;
 let lexical=query.replace(/\b(?:under|max|högst|upp till|mindre än|budget(?: på| är)?|för högst)\s+\d(?:[\d \u00a0\u202f]*\d)?(?:\s*(?:tusen|k)(?![a-z]))?\s*(?:kr|kronor|sek|mil|km)?/giu,' ').replace(/\b(?:från|tidigast|årsmodell(?: från)?|till|senast)\s+(?:19|20)\d{2}\b/gi,' ').replace(/\b(?:automat(?:isk)?|manuell)\b/gi,' ').replace(/\b(?:och|med|en|ett)\b/gi,' ').replace(/\s+/g,' ').trim();
 lexical=lexical.replace(/\b(?:bensin|diesel|elbil|laddhybrid|hybrid|etanol|gas)\b/gi,' ').replace(/\s+/g,' ').trim();
 if(location){const city=normalize(location.label);lexical=normalize(lexical).replace(new RegExp('(?:^| )(?:(?:i|nara|kring|runt|omkring|fran) )'+city+'(?: |$)'),' ').replace(/\binom \d+ (?:km|mil)\b/g,' ').trim();if(!f.sort&&/nära|närmast/i.test(query))f.sort='distance';}
 f.query=lexical||undefined;return validateFilters(f);
}
module.exports={manualIntent,userIntent,groundedFilters,explicitBounds,explicitMakes,explicitModels};

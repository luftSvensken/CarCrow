const {normalize,makes}=require('./search-query.cjs');
const {validateFilters}=require('./core.cjs');
const modelNames=['V40','V50','V60','V70','V90','S40','S60','S80','S90','XC40','XC60','XC70','XC90','Jazz','Civic','Accord','CR-V','Fit','Mazda 2','Mazda 3','Mazda 6','MX-5','Yaris','Corolla','Auris','Avensis','RAV4','Golf','Passat','Polo','Tiguan','Touran','Octavia','Fabia','Superb','Focus','Fiesta','Mondeo','Model 3','Model Y','A1','A3','A4','A5','A6','Q3','Q5','Q7','9-3','9-5'];
function hasPhrase(text,phrase){return (' '+normalize(text)+' ').includes(' '+normalize(phrase)+' ');}
function explicitMakes(text){const found=makes.filter(m=>hasPhrase(text,m));return found.filter(m=>!new RegExp('(?:inte|ingen|inga|utom) '+normalize(m)+'\\b').test(normalize(text)));}
function explicitModels(text,facets=[]){
 const found=[...new Set([...modelNames,...facets.map(m=>m.model)])].filter(m=>hasPhrase(text,m));
 for(const match of normalize(text).matchAll(/\b([1-8])\s*serie\b/g))found.push(match[1]+'-serie');
 // A numbered BMW badge is a model, not a minimum model year or budget.
 for(const match of normalize(text).matchAll(/\b([1-8]\d{2}[diex]+)\b/g))found.push(match[1]);
 return [...new Set(found)];
}
function explicitBounds(text){
 const bounds={};
 for(const match of text.toLowerCase().matchAll(/\b(under|max|högst|upp till|mindre än|budget(?: på| är)?|för högst)\s+(\d(?:[\d \u00a0\u202f]*\d)?)(?:\s*(tusen|k)(?![a-z]))?\s*(kr|kronor|sek|mil|km)?/gu)){
  let n=Number(match[2].replace(/\s/g,''))*(match[3]?1000:1);const unit=match[4],strict=['under','mindre än'].includes(match[1]);
  if(unit==='mil'||unit==='km'){if(unit==='km')n=Math.floor(n/10);bounds.maxMileage=Math.max(0,n-(strict?1:0));}
  else if(['kr','kronor','sek'].includes(unit)||(!unit&&n>=10000))bounds.maxPrice=Math.max(0,n-(strict?1:0));
 }
 const year=text.match(/\b(?:från|tidigast|årsmodell(?: från)?)\s+(19\d{2}|20\d{2})\b/i);if(year)bounds.minYear=Number(year[1]);
 const maxYear=text.match(/\b(?:till|senast)\s+(19\d{2}|20\d{2})\b/i);if(maxYear)bounds.maxYear=Number(maxYear[1]);
 return validateFilters(bounds);
}
function userIntent(texts,ui={},facets=[]){
 const out={...ui};
 for(const text of texts){
  const brands=explicitMakes(text),models=explicitModels(text,facets);
  if(brands.length){out.makes=brands;delete out.models;}
  if(models.length)out.models=models;
  const specifics=text.match(/\b(?:business(?: edition)?|summum|momentum|inscription|dragkrok|panoramatak|skinn|m[- ]sport|r[- ]design)\b/gi);if(specifics?.length)out.query=specifics.join(' ');
  Object.assign(out,explicitBounds(text));
  if(/\bautomat(?:isk)?\b/i.test(text))out.gearbox='Automat';else if(/\bmanuell\b/i.test(text))out.gearbox='Manuell';
  const fuels=['Bensin','Diesel','El','Laddhybrid','Hybrid','Etanol','Gas'].filter(f=>new RegExp('\\b'+f+'(?:bil|bilar)?\\b','i').test(text));if(fuels.length)out.fuelTypes=fuels;
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
 if(['relevance','newest','priceAsc','priceDesc','mileage','deals'].includes(proposed.sort)&&!intent.sort)result.sort=proposed.sort;
 if(result.query&&!result.sort)result.sort='relevance';
 return validateFilters(result);
}
module.exports={userIntent,groundedFilters,explicitBounds,explicitMakes,explicitModels};

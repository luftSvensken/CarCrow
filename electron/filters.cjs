const {validateLocation}=require('./geography.cjs');
const FUELS=['Bensin','Diesel','El','Laddhybrid','Hybrid','Etanol','Gas'];
const GEARS=['Automat','Manuell'];
const SORTS=['relevance','newest','priceAsc','priceDesc','mileage','yearDesc','distance','deals'];
const BODY_TYPES=['Kombi','Halvkombi','Sedan','SUV','Coupé','Cabriolet','Pickup','Minibuss'];
const numKeys={minPrice:[0,100000000],maxPrice:[0,100000000],minYear:[1900,2100],maxYear:[1900,2100],minMileage:[0,1000000],maxMileage:[0,1000000],publishedWithinDays:[1,365]};
function validateFilters(raw={}){
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Ogiltiga sökfilter.');const out={};
 for(const [k,v] of Object.entries(raw)){
  if(v===null||v===undefined||v==='')continue;
  if(k in numKeys){const [lo,hi]=numKeys[k];if(!Number.isInteger(v)||v<lo||v>hi)throw new Error('Ogiltigt numeriskt sökfilter: '+k);out[k]=v;}
  else if(['makes','models','fuelTypes','bodyTypes','sources','cities'].includes(k)){
   if(!Array.isArray(v)||v.length>30||v.some(x=>typeof x!=='string'||!x.trim()||x.length>100))throw new Error('Ogiltigt filter: '+k);
   if(k==='fuelTypes'&&v.some(x=>!FUELS.includes(x)))throw new Error('Okänt bränsle.');
   const seen=new Set();out[k]=v.map(x=>x.trim()).filter(x=>{const n=x.toLocaleLowerCase('sv');if(seen.has(n))return false;seen.add(n);return true;});if(!out[k].length)delete out[k];
  }else if(k==='gearbox'){if(!GEARS.includes(v))throw new Error('Okänd växellåda.');out[k]=v;}
  else if(k==='query'){if(typeof v!=='string')throw new Error('Textfält har fel format.');out[k]=v.trim().slice(0,300);}
  else if(k==='sort'){if(!SORTS.includes(v))throw new Error('Okänd sortering.');out[k]=v;}
  else if(k==='sellerType'){if(!['dealer','private'].includes(v))throw new Error('Okänd typ av säljare.');out[k]=v;}
  else if(k==='hasImages'){if(typeof v!=='boolean')throw new Error('Ogiltigt bildfilter.');if(v)out[k]=true;}
  else if(k==='location')out[k]=validateLocation(v);
  else throw new Error('Okänt sökfilter: '+k);
 }
 for(const [min,max] of [['minPrice','maxPrice'],['minYear','maxYear'],['minMileage','maxMileage']])if(out[min]>out[max])throw new Error('Från-värdet måste vara lägre än till-värdet.');
 if(out.sort==='distance'&&!out.location)throw new Error('Välj en ort för att sortera efter avstånd.');return out;
}
function normalizeBody(value){const s=String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();for(const [key,pattern] of [['SUV',/suv|crossover|terrang/],['Halvkombi',/halvkombi|hatchback/],['Kombi',/kombi|estate|wagon/],['Cabriolet',/cab|convertible/],['Coupé',/coupe/],['Pickup',/pickup|pick up/],['Minibuss',/minibuss|mpv|minivan/],['Sedan',/sedan|saloon/]])if(pattern.test(s))return key;return value||'';}
const nullableInt={type:['integer','null'],minimum:0};
const textArray={type:'array',items:{type:'string'},maxItems:30};
const FILTER_SCHEMA={type:'object',additionalProperties:false,properties:{makes:textArray,models:textArray,minPrice:nullableInt,maxPrice:nullableInt,minYear:nullableInt,maxYear:nullableInt,minMileage:nullableInt,maxMileage:nullableInt,fuelTypes:{...textArray,items:{type:'string',enum:FUELS}},gearbox:{type:['string','null'],enum:[...GEARS,null]},query:{type:['string','null']},sort:{type:'string',enum:SORTS},bodyTypes:textArray,sources:textArray,cities:textArray,sellerType:{type:['string','null'],enum:['dealer','private',null]},hasImages:{type:'boolean'},publishedWithinDays:{type:'integer',minimum:1,maximum:365},location:{type:'object',additionalProperties:false,properties:{label:{type:'string'},radiusKm:{type:'integer',minimum:1,maximum:2500}},required:['label']}},required:[]};
module.exports={validateFilters,FUELS,GEARS,SORTS,BODY_TYPES,normalizeBody,FILTER_SCHEMA};

// One lexical search language for source queries, the database and the agent.
// Index actual ad fields, never JSON keys, image URLs or tracking parameters.
const aliases={vw:'volkswagen',volkswagon:'volkswagen',volksvagen:'volkswagen',merc:'mercedes benz',mercedes:'mercedes benz',mb:'mercedes benz',citroen:'citroen',skoda:'skoda',automatisk:'automat',automatic:'automat',manual:'manuell',petrol:'bensin',gasoline:'bensin',electric:'el',series:'serie',serien:'serie'};
const makes=require('./brands.cjs').displayBrands;
const vocabulary=[...makes.map(x=>basic(x)), 'business','summum','momentum','inscription','r design','dragkrok','panorama','octavia','passat','golf','corolla','yaris','avensis','auris','jazz','civic','focus','fiesta','mondeo','outback','forester','tiguan','touran','superb','fabia'];
function basic(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function normalize(s){
 const value=basic(s).replace(/\b([vscxa])(\s+)(\d{2,3})\b/g,'$1$3').replace(/\bmercedes benz\b/g,'mercedes');
 return value.split(' ').map(w=>aliases[w]||w).join(' ').replace(/\bmercedes benz benz\b/g,'mercedes benz').replace(/\s+/g,' ').trim();
}
function distance(a,b){let previous=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const row=[i+1];for(let j=0;j<b.length;j++)row.push(Math.min(row[j]+1,previous[j+1]+1,previous[j]+(a[i]===b[j]?0:1)));previous=row;}return previous[b.length];}
function correctQuery(s){
 if(String(s||'').includes('|'))return String(s).split('|').map(correctQuery).filter(Boolean).join(' eller ');
 const original=normalize(s),words=original.split(' ').map(w=>{
  if(w.length<4||/\d/.test(w)||vocabulary.includes(w))return w;
  const scored=vocabulary.filter(x=>!x.includes(' ')).map(x=>({x,d:distance(w,x)})).filter(x=>x.d<=(w.length>=8?2:1)).sort((a,b)=>a.d-b.d);
  return scored.length&&(!scored[1]||scored[0].d<scored[1].d)?scored[0].x:w;
 });
 return words.join(' ');
}
function terms(query){
 const groups=correctQuery(query).split(/\s+(?:eller|or)\s+|\s*\|\s*/).map(branch=>branch.split(' ').filter(Boolean));
 return groups.filter(g=>g.length).map(g=>g.slice(0,30));
}
function modelKeys(make,model,variant=''){
 const m=normalize(model),keys=new Set([m]);
 if(normalize(make)==='bmw'){
  const family=m.match(/^([1-8])\s*(?:serie|series)$/)?.[1]||m.match(/^([1-8])\d{2}(?:[a-z]+)?(?:\s|$)/)?.[1];
  if(family)keys.add(family+' serie');
 }
 if(/^v\d{2}\s+(?:ii|iii|iv|cross country)$/.test(m))keys.add(m.split(' ')[0]);
 // Model variants retain their exact badge as well as the manufacturer's family.
 for(const badge of normalize(variant).match(/\b\d{3}[die]\b/g)||[])keys.add(badge);
 return [...keys].join(' ');
}
function indexAd(ad){
 const make=normalize(ad.make),model=modelKeys(ad.make,ad.model,(ad.comparisonVariant||'')+' '+(ad.variant||'')),title=normalize(ad.title),variant=normalize((ad.variant||'')+' '+(ad.comparisonVariant||''));
 const full=normalize([ad.make,ad.model,model,ad.title,ad.variant,ad.comparisonVariant,ad.description,ad.bodyType,ad.fuel,ad.gearbox,ad.city,ad.seller,ad.year].filter(Boolean).join(' '));
 return [make,model,title,variant,full].map(s=>' '+s+' ');
}
function pattern(term){return '% '+term.replace(/[\\%_]/g,'\\$&')+(/\d/.test(term)?' %':'%');}
function querySQL(query){
 const groups=terms(query),params=[];
 const match=groups.map(group=>'('+group.map(term=>{params.push(pattern(term));return "sx.full LIKE ? ESCAPE '\\'";}).join(' AND ')+')').join(' OR ');
 const unique=[...new Set(groups.flat())],scoreParams=[];
 const score=unique.map(term=>['make','model','title','variant'].map((field,i)=>{scoreParams.push(pattern(term));return `CASE WHEN sx.${field} LIKE ? ESCAPE '\\' THEN ${[12,10,6,4][i]} ELSE 0 END`;}).join('+')).join('+')||'0';
 return {match:match||(query?'0':'1'),params,score,scoreParams,corrected:correctQuery(query)};
}
function modelSQL(models){
 const params=[];const sql=models.map(model=>{const n=normalize(model);params.push('% '+n+' %','% '+n+' %');return "(sx.model LIKE ? ESCAPE '\\' OR sx.variant LIKE ? ESCAPE '\\')";}).join(' OR ');
 return {sql:'('+sql+')',params};
}
function sourceQuery(f){
 const query=f.query?correctQuery(f.query):'';
 const model=f.models?.length===1?f.models[0]:'';
 return [model,query].filter(Boolean).filter((x,i,a)=>!i||normalize(a[0])!==normalize(x)).join(' ');
}
module.exports={normalize,correctQuery,terms,indexAd,querySQL,modelSQL,sourceQuery,modelKeys,makes,distance};

// Keep the model's conclusions and caveats; specs already have database-backed cards.
function conciseAnswer(text,cars=[],filters={}){
 const prices=new Set(cars.flatMap(c=>[c.price,c.comparison?.median]).filter(Number.isFinite));for(const n of [filters.minPrice,filters.maxPrice,filters.maxPrice!=null?filters.maxPrice+1:null])if(Number.isFinite(n))prices.add(n);
 const unsupportedPrice=[...text.matchAll(/(\d[\d \u00a0\u202f]*)\s*(?:kr|kronor|SEK)\b/g)].some(m=>!prices.has(Number(m[1].replace(/\s/g,''))));
 const redundant=/<\/?(?:tool_call|function|parameter)[\s=>]|\b(?:search_market|search_database|inspect_car|compare_cars)\b/i.test(text)||/\b(?:endast|bara|enbart)\s+(?:\d+|en|ett|två|tre|fyra|fem)\s+(?:bil|annons|träff)|\b(?:inga|ingen)\s+(?:bilar|bil|annonser|annons|träffar)|\b(?:visar|hittade|hittar|finns|fann|matchar)[^.!?\n]{0,60}?\b(?:\d+|en|ett|två|tre|fyra|fem|sex|sju|åtta|nio|tio)\s+(?:bil|annons|träff|alternativ)|\ben enda\s+(?:bil|annons|träff)/i.test(text)||/^\s*\|.*\|\s*$/m.test(text)||/^\s*\d+[.)]\s.*\bkr\b/m.test(text)||/\([^)]*(?:\b(?:19|20)\d{2}\b|\bkr\b|\bkm\b|\bmil\b)[^)]*\)/i.test(text);
 if(cars.length&&cars.every(c=>Number.isFinite(c.price))&&(!text.trim()||unsupportedPrice||redundant||text.split(/\s+/u).length>80)){
  if(filters.comparison&&!cars.some(c=>c.comparison?.median))return 'Underlaget räcker inte för att avgöra vilken bil som är billigast jämfört med liknande annonser. Minst fem andra jämförbara bilar behövs.';
  const best=[...cars].sort((a,b)=>a.price-b.price)[0];
  if(filters.sort==='deals'||cars.some(c=>c.comparison?.median)){const deal=[...cars].filter(c=>c.comparison?.median&&c.comparison.percentBelow>0).sort((a,b)=>b.comparison.percentBelow-a.comparison.percentBelow)[0];if(deal)return `${deal.make} ${deal.model} ligger ${deal.comparison.percentBelow.toLocaleString('sv-SE')} % under medianen för ${deal.comparison.sampleSize} jämförbara annonser. Underlaget gäller annonspriser; bilens skick behöver kontrolleras i originalannonsen.`;}
  return `Bilarna som matchar din sökning visas i korten. ${best.make} ${best.model} från ${best.year} har lägst annonspris i det visade urvalet: ${best.price.toLocaleString('sv-SE')} kr.`+(filters.hasMore?' Fler annonser kan hämtas.':filters.sourceWarning?' Några källor kunde inte hämtas.':'');
 }
 let answer=text;
 if(cars.length){
  answer=answer.replace(/^(?:Jag har hittat|Hittade|Jag hittade|Det finns)\s+\d+[\s\S]*?(?=\n\n)/i,'Här är bilarna som matchar din sökning.');
  answer=answer.split('\n').filter(line=>{
   if(/^\s*\|.*\|\s*$/.test(line))return false;
   if(/^\s*\d+[.)]\s/.test(line)&&cars.some(car=>line.toLowerCase().includes(car.make.toLowerCase())))return false;
   return true;
  }).join('\n').replace(/\n{3,}/g,'\n\n').trim();
 }
 if(answer.split(/\s+/u).length>80){
  const sentences=answer.split(/(?<=[.!?])\s+(?=[A-ZÅÄÖ])/u).map(s=>s+' ');let short='';
  for(const sentence of sentences){if((short+sentence).trim().split(/\s+/u).length>80)break;short+=sentence;}
  if(short.trim())answer=short.trim();
 }
 return answer;
}
module.exports={conciseAnswer};

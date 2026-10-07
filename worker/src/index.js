const names=new Set(['search_market','search_database','inspect_car','compare_cars','search_web']);
const freeModels=new Set(['nvidia/nemotron-3-ultra-550b-a55b:free','nvidia/nemotron-3-super-120b-a12b:free','google/gemma-4-31b-it:free']);
function modelOrder(env,requested='openrouter/free'){
 const primary=freeModels.has(env.MODEL)?env.MODEL:'nvidia/nemotron-3-super-120b-a12b:free';
 const fallback=freeModels.has(env.FALLBACK_MODEL)?env.FALLBACK_MODEL:'nvidia/nemotron-3-ultra-550b-a55b:free';
 // Legacy clients use the alias. A candidate other than the primary can be
 // evaluated on its own, without silently attributing a fallback's answer to it.
 return requested==='openrouter/free'||requested===primary?[...new Set([primary,fallback])]:[requested];
}
const error=(message,status)=>Response.json({error:{message}},{status,headers:{'Cache-Control':'no-store'}});
/** @param {Request | Response} request @param {number} maxBytes */
async function boundedJSON(request,maxBytes=512*1024){
 const reader=request.body?.getReader();if(!reader)throw new Error('Tom begäran.');
 const parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBytes){await reader.cancel();throw new Error('Begäran är för stor.');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return JSON.parse(new TextDecoder().decode(bytes));
}
export default {
 /** @param {Request} request @param {Env & {OPENROUTER_API_KEY?:string,TAVILY_API_KEY?:string}} env @param {ExecutionContext} ctx */
 async fetch(request,env,ctx){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return Response.json({ok:true,models:modelOrder(env),version:'0.5.0'});
  if(url.pathname==='/v1/search'&&request.method==='POST')return search(request,env,ctx);
  if(url.pathname!=='/v1/chat/completions'||request.method!=='POST')return error('Okänd funktion.',404);
  if(!env.OPENROUTER_API_KEY)return error('AI-anslutningen är inte färdigkonfigurerad.',503);
  const ip=request.headers.get('CF-Connecting-IP');if(!ip)return error('Anslutningen kunde inte verifieras.',403);
  const limit=await env.AI_LIMITER.limit({key:ip});if(!limit.success)return error('Många AI-anrop just nu. Försök igen om en minut.',429);
  try{
   const data=await boundedJSON(request);
   if(data.model!=='openrouter/free'&&!freeModels.has(data.model)||data.stream!==true||!Array.isArray(data.messages)||data.messages.length<1||data.messages.length>48)return error('Ogiltigt AI-anrop.',400);
   if(data.messages.some(m=>!['system','user','assistant','tool'].includes(m.role)||(m.content!=null&&typeof m.content!=='string')))return error('Ogiltiga meddelanden.',400);
   if(!Array.isArray(data.tools)||data.tools.length>5||data.tools.some(t=>t.type!=='function'||!names.has(t.function?.name)))return error('Okänt verktyg.',400);
   const payload={models:modelOrder(env,data.model),route:'fallback',provider:{max_price:{prompt:0,completion:0,request:0}},stream:true,messages:data.messages,tools:data.tools,tool_choice:data.tool_choice==='none'?'none':'auto',temperature:0.2,max_tokens:8192,reasoning:{effort:'low',exclude:true}};
   const upstream=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json',Accept:'text/event-stream','X-Title':'CarCrow'},body:JSON.stringify(payload),signal:AbortSignal.any([request.signal,AbortSignal.timeout(110000)])});
   if(!upstream.ok){const failed=await boundedJSON(upstream,32768).catch(()=>null),daily=/per.day|daily|daglig/i.test(failed?.error?.message||'');return error(upstream.status===429?(daily?'OpenRouters dagliga gratiskvot är nådd. Försök igen efter återställningen.':'Gratisservern är tillfälligt begränsad. Försök senare.'):'AI-tjänsten kunde inte slutföra anropet.',upstream.status===429?429:502);}
   if(!upstream.headers.get('Content-Type')?.includes('text/event-stream')){await upstream.body?.cancel();return error('AI-tjänsten returnerade ingen ström.',502);}
   return new Response(upstream.body,{headers:{'Content-Type':'text/event-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(e){return error(e instanceof Error&&e.message==='Begäran är för stor.'?e.message:'AI-anropet kunde inte slutföras.',e instanceof Error&&e.message==='Begäran är för stor.'?413:400);}
 }
};

/** @param {Request} request @param {Env & {TAVILY_API_KEY?:string}} env @param {ExecutionContext} ctx */
async function search(request,env,ctx){
 if(!env.TAVILY_API_KEY)return error('Webbsökningen är inte färdigkonfigurerad.',503);
 const ip=request.headers.get('CF-Connecting-IP');if(!ip)return error('Anslutningen kunde inte verifieras.',403);
 if(!(await env.SEARCH_LIMITER.limit({key:ip})).success)return error('Webbsökningens gräns är nådd. Försök senare.',429);
 try{
  const data=await boundedJSON(request,8192);if(typeof data.query!=='string'||data.query.trim().length<3||data.query.length>300)return error('Ogiltig sökfråga.',400);
  const query=data.query.trim();const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(query.toLowerCase()));const key=new Request(new URL('/search-cache/v4/'+Array.from(new Uint8Array(hash)).map(n=>n.toString(16).padStart(2,'0')).join(''),request.url));
  const cached=await caches.default.match(key);if(cached)return cached;
  const upstream=await fetch('https://api.tavily.com/search',{method:'POST',headers:{Authorization:'Bearer '+env.TAVILY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({query,search_depth:'basic',max_results:6,topic:'general',include_answer:false,include_raw_content:false,auto_parameters:false,include_domains:['adac.de','nhtsa.gov','haynes.com','honestjohn.co.uk','whatcar.com','carwow.co.uk','autocar.co.uk','volvocars.com','bmw.com','audi.com','toyota.com','mercedes-benz.com','vibilagare.se','teknikensvarld.se'],include_domains_mode:/reliability|common problems|pålitlig|vanliga fel|återkallel/i.test(query)?'restrict':'prefer',exclude_domains:['facebook.com','youtube.com','blocket.se','bytbil.com','bilweb.se','carchecker.pro']}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  if(!upstream.ok){await upstream.body?.cancel();return error('Webbsökningen är tillfälligt begränsad.',[402,429,432].includes(upstream.status)?429:502);}
  const result=await boundedJSON(upstream,512*1024);
  const sources=(Array.isArray(result.results)?result.results:[]).slice(0,6).sort((a,b)=>relevance(b,query)-relevance(a,query));
  const urls=sources.slice(0,3).map(s=>s.url).filter(u=>{try{const p=new URL(u);return p.protocol==='https:'&&/\.[a-z]{2,}$/i.test(p.hostname)&&!p.username&&!p.password;}catch{return false;}});
  if(urls.length){
   const extraction=await fetch('https://api.tavily.com/extract',{method:'POST',headers:{Authorization:'Bearer '+env.TAVILY_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({urls,query,chunks_per_source:5,extract_depth:'basic',format:'text',timeout:8}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(10000)])});
   if(extraction.ok){const extracted=await boundedJSON(extraction,512*1024);for(const source of sources){const page=extracted.results?.find(s=>s.url===source.url);source.raw_content=page?.raw_content||null;}}else {await extraction.body?.cancel();for(const source of sources)source.raw_content=null;}
  }
  const response=Response.json({results:sources.map(s=>({title:String(s.title||'').slice(0,300),url:String(s.url||'').slice(0,2000),content:String(s.content||'').slice(0,700),raw_content:s.raw_content?String(s.raw_content).slice(0,6500):null}))},{headers:{'Cache-Control':'public, max-age=900','X-Content-Type-Options':'nosniff'}});
  ctx.waitUntil(caches.default.put(key,response.clone()));return response;
 }catch(e){return error(e instanceof Error&&e.message==='Begäran är för stor.'?e.message:'Webbsökningen kunde inte slutföras.',e instanceof Error&&e.message==='Begäran är för stor.'?413:502);}
}

function relevance(source,query){
 const title=String(source.title||'').toLowerCase().replace(/[^a-z0-9]+/g,' '),terms=query.toLowerCase().match(/[a-z0-9]{2,}/g)||[];
 let score=terms.filter(t=>!['reliability','common','problems','used','report','car'].includes(t)).reduce((n,t)=>n+(title.includes(t)?2:0),0);
 const family=query.match(/(\d)\s*series/i);if(family&&new RegExp('\\b'+family[1]+'\\s*series\\b').test(title))score+=8;
 const year=Number(query.match(/\b(?:19|20)\d{2}\b/)?.[0]);const range=title.match(/((?:19|20)\d{2})\s+((?:19|20)\d{2})/);if(year&&range&&year>=Number(range[1])&&year<=Number(range[2]))score+=4;
 return score;
}

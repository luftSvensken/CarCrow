const fs=require('node:fs'),assert=require('node:assert/strict');
const {Store}=require('../electron/core.cjs'),{Market}=require('../electron/market.cjs'),{SearchSessions}=require('../electron/search-sessions.cjs'),{CarAgent}=require('../electron/agent.cjs'),{streamCompletion}=require('../electron/stream.cjs'),{requestJSON}=require('../electron/services.cjs');
(async()=>{
 const report={startedAt:new Date().toISOString(),method:'Same real Blocket responses cached across candidates; actual shared Worker, no fixture AI or key.',models:[]},cache=new Map();fs.mkdirSync('test-results',{recursive:true});
 const candidates=process.argv.includes('--super')?['nvidia/nemotron-3-super-120b-a12b:free']:process.argv.includes('--gemma')?['google/gemma-4-31b-it:free']:['nvidia/nemotron-3-super-120b-a12b:free','google/gemma-4-31b-it:free'];
 for(let index=0;index<candidates.length;index++){
  const model=candidates[index],store=await Store.create();store.setSource({id:'blocket',name:'Blocket',enabled:true,adapter:'blocket-public',hosts:['www.blocket.se','blocket.se'],mediaAllowed:true});const market=new Market(store,{request:async(url,options)=>{if(!cache.has(url))cache.set(url,await requestJSON(url,options));return cache.get(url);}}),sessions=new SearchSessions(store,market),record={requestedModel:model,turns:[],calls:[]};report.models.push(record);
  let finish;const agent=new CarAgent({store,market,sessions,model,key:()=>null,emit:e=>{if(['done','error','stopped'].includes(e.type))finish(e);},stream:async options=>{const at=performance.now();try{const r=await streamCompletion(options);record.calls.push({ms:performance.now()-at,actualModel:r.model,answer:r.content,tools:r.tool_calls?.map(c=>({name:c.function.name,arguments:c.function.arguments}))||[]});return r;}catch(e){record.calls.push({ms:performance.now()-at,error:e.message});throw e;}}});
  let chatId;
  try{for(const text of ['Jag vill hitta en billig pålitlig första bil under 60 000 kr, helst lägre.','Sök efter V70 business, fortfarande under 60 000 kr.']){
   const done=new Promise(r=>finish=r),at=performance.now();agent.start({chatId,text});const event=await done,message=event.chat.messages.at(-1);chatId=event.chat.id;
   const result={text,status:event.type,ms:performance.now()-at,cars:event.chat.cars.length,filters:event.chat.filters,answer:message.text,note:message.note||null,error:message.error||null};record.turns.push(result);console.log(JSON.stringify({model,...result}));
   assert.equal(event.type,'done',message.error);assert.ok(event.chat.cars.length>1);assert.ok(event.chat.cars.every(c=>c.price>1&&c.price<60000));assert.doesNotMatch(message.text,/endast en|bara en|enbart en/i);
   if(!text.includes('V70')){assert.equal(event.chat.filters.makes,undefined);assert.equal(event.chat.filters.minYear,undefined);}else assert.ok(event.chat.cars.every(c=>c.model==='V70'));
  }}catch(e){record.error=e.message;}finally{store.db.close();fs.writeFileSync('test-results/model-live05.json',JSON.stringify(report,null,2));}
  // Slow, failed or deterministic fallback answers are not a good default.
  
 }
 report.finishedAt=new Date().toISOString();fs.writeFileSync('test-results/model-live05.json',JSON.stringify(report,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});

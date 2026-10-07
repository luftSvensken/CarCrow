const fs=require('node:fs'),assert=require('node:assert/strict'),{Store}=require('../electron/core.cjs'),{Market}=require('../electron/market.cjs'),{SearchSessions}=require('../electron/search-sessions.cjs'),{CarAgent}=require('../electron/agent.cjs'),{requestJSON}=require('../electron/services.cjs'),{buildURL,parseCar}=require('../electron/blocket.cjs');
(async()=>{
 const store=await Store.create(),source={id:'blocket',name:'Blocket',adapter:'blocket-public',enabled:true,mediaAllowed:true,hosts:['www.blocket.se','blocket.se']};store.setSource(source);
 if(process.argv.includes('--all'))for(const [id,name,adapter,hosts] of [['bytbil','Bytbil','public-html',['www.bytbil.com','bytbil.com']],['wayke','Wayke','public-html',['www.wayke.se','wayke.se']],['kvd','Kvdbil','kvd-public',['www.kvd.se','kvd.se']],['riddermark','Riddermark Bil','riddermark-public',['www.riddermarkbil.se']]])store.setSource({id,name,adapter,hosts,enabled:true,mediaAllowed:true});
 const report={startedAt:new Date().toISOString(),queries:[],ai:[],status:'running'};fs.mkdirSync('test-results',{recursive:true});
 try{
  const market=new Market(store),sessions=new SearchSessions(store,market);
  for(const filters of [{query:'V70 business'},{makes:['BMW'],models:['3-serie'],maxPrice:199999},{query:'Honda Jazz',maxPrice:59999},{query:'VW Golf',maxPrice:99999}]){
   const at=performance.now();let first=null;const result=await sessions.start(filters,{onResults:r=>{if(r.items.length&&first===null)first=performance.now()-at;}});
   const raw=await requestJSON(buildURL(filters)),valid=raw.docs.map(parseCar).filter(Boolean);const session=sessions.sessions.get(result.sessionId);
   const checked=store.search(filters,false,0,false,[...session.ids],false,[],[...session.queryIds]);
   assert.ok(result.items.length>0,JSON.stringify(filters));assert.equal(checked.total,result.total);if(filters.maxPrice)assert.ok(result.items.every(c=>c.price<=filters.maxPrice));
   report.queries.push({filters,upstreamTotal:raw.metadata?.result_size?.match_count,upstreamFirstPageValid:valid.length,matchedRetrieved:result.total,displayed:result.items.length,hasMore:result.hasMore,firstCardsMs:first,completedMs:performance.now()-at,examples:result.items.slice(0,3).map(({title,variant,price})=>({title,variant,price}))});
   console.log(JSON.stringify(report.queries.at(-1)));fs.writeFileSync('test-results/search-live05.json',JSON.stringify(report,null,2));
  }
  if(process.argv.includes('--ai')){
   // The real shared Worker uses the fixed free-only model chain. No fixture model or key.
   let finish;const ended=()=>new Promise(r=>finish=r),events=[];const agent=new CarAgent({store,market,sessions,key:()=>null,emit:e=>{events.push(e);if(['done','error','stopped'].includes(e.type))finish(e);}});
   let task=ended();agent.start({text:'Jag vill hitta en billig pålitlig första bil under 60 000 kr, helst lägre.'});let event=await task;
   for(const [label,e] of [['first-car',event]]){const m=e.chat.messages.at(-1);assert.equal(e.type,'done',m.error);assert.ok(e.chat.cars.length>1);assert.ok(e.chat.cars.every(c=>c.price<60000));assert.equal(e.chat.filters.minYear,undefined);assert.equal(e.chat.filters.makes,undefined);assert.equal(e.chat.filters.models,undefined);assert.doesNotMatch(m.text,/endast en|bara en|enbart en/i);report.ai.push({label,filters:e.chat.filters,cars:e.chat.cars.length,total:e.chat.total,hasMore:e.chat.hasMore,answer:m.text,models:[...new Set(events.filter(e=>e.type==='model').map(e=>e.model))],status:e.type});}
   task=ended();agent.start({chatId:event.chat.id,text:'Sök efter V70 business, fortfarande under 60 000 kr.'});event=await task;const m=event.chat.messages.at(-1);assert.equal(event.type,'done',m.error);assert.ok(event.chat.cars.length>0);assert.ok(event.chat.cars.every(c=>c.model==='V70'&&c.price<60000));report.ai.push({label:'V70-business-followup',filters:event.chat.filters,cars:event.chat.cars.length,answer:m.text,status:event.type});console.log(JSON.stringify({ai:report.ai}));
  }
  report.status='passed';
 }catch(e){report.status='failed';report.error=e.message;throw e;}finally{report.finishedAt=new Date().toISOString();fs.writeFileSync('test-results/search-live05.json',JSON.stringify(report,null,2));store.db.close();}
})().catch(e=>{console.error(e.message);process.exitCode=1;});

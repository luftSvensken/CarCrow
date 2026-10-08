const crypto=require('node:crypto');
const {validateFilters}=require('./core.cjs');
const {sourceGroups}=require('./market.cjs');
class SearchSessions {
 constructor(store,market){this.store=store;this.market=market;this.sessions=new Map();}
 sources(session,options={}){return this.store.sources().filter(s=>s.enabled&&s.adapter&&(!(options.sources||session.filters.sources)||(options.sources||session.filters.sources).includes(s.id)));}
 hasMore(session){return session.lanes.some(lane=>this.sources(session).some(s=>!lane.state.sources[s.id]?.done&&!lane.state.sources[s.id]?.error));}
 collect(session,excludeIds=[],limit=48){const filters=session.viewFilters||session.filters,ids=[...session.ids],queryIds=[...session.queryIds];const first=this.store.search(filters,false,0,false,ids,false,excludeIds,queryIds),items=[...first.items];for(let page=1;items.length<Math.min(first.total,limit);page++)items.push(...this.store.search(filters,false,page,false,ids,false,excludeIds,queryIds).items);return {...first,items:items.slice(0,limit),total:this.store.search(filters,false,0,false,ids,false,[],queryIds).total};}
 coverage(session){const out={};for(const lane of session.lanes)for(const [id,c] of Object.entries(lane.state.sources)){const old=out[id]||{pages:0,received:0,done:true,limited:false};out[id]={...old,pages:old.pages+(c.pages||0),received:old.received+(c.received||0),done:old.done&&!!c.done,limited:old.limited||!!c.limited,error:old.error||c.error||null,total:c.total};}return out;}
 present(session,excludeIds,limit=48){const local=this.collect(session,excludeIds,limit),coverage=this.coverage(session),sources=this.sources(session),alternativesTotal=session.lanes.reduce((n,l)=>n+sources.reduce((sum,s)=>sum+sourceGroups(l.filters,s.adapter).length,0),0),alternativesRead=session.lanes.reduce((n,l)=>n+sources.reduce((sum,s)=>sum+Object.keys(l.state.sources[s.id]?.groups||{}).length,0),0),failedSources=Object.keys(coverage).filter(id=>coverage[id].error),limitedSources=Object.keys(coverage).filter(id=>coverage[id].limited);const hasMore=this.hasMore(session);return {...session.last,...local,filters:session.viewFilters||session.filters,sessionId:session.id,coverage,hasMore,remaining:Math.max(0,local.total-local.items.length-excludeIds.length),searchComplete:true,marketComplete:!hasMore&&!failedSources.length&&!limitedSources.length,sourceWarning:failedSources.map(id=>id+': '+coverage[id].error).join(' ')||null,retrieval:{fetched:Object.values(coverage).reduce((n,c)=>n+c.received,0),matched:local.total,alternativesRead,alternativesTotal,failedSources,limitedSources}};}
 async start(filters={},options={}){
  const now=Date.now();for(const [id,s] of this.sessions)if(now-s.touched>3600000)this.sessions.delete(id);
  const f=validateFilters(filters),id=crypto.randomUUID(),session={id,filters:f,state:{sources:{}},ids:new Set(),queryIds:new Set(),touched:now,lanes:[]};
  const sorts=options.diverse&&f.sort==='priceAsc'?['priceAsc','newest']:[f.sort];
  session.lanes=sorts.map((sort,i)=>({id:id+':'+i,filters:validateFilters({...f,sort}),state:i===0?session.state:{sources:{}},ids:session.ids,queryIds:session.queryIds}));
  this.sessions.set(id,session);return this.fetchMatching(session,options.excludeIds||[],options);
 }
 async fetchMatching(session,excludeIds,options){
  const target=Math.max(48,Math.min(192,options.targetResults||(session.lanes.length>1?96:48))),sources=this.sources(session,options);
  const alternatives=Math.max(1,...session.lanes.flatMap(l=>sources.map(s=>sourceGroups(l.filters,s.adapter).length))),maxRounds=Math.min(32,Math.max(4,alternatives));
  for(let page=0;page<maxRounds;page++){
   for(const lane of session.lanes){
    if(!sources.some(s=>!lane.state.sources[s.id]?.done&&!lane.state.sources[s.id]?.error))continue;
    session.last=await this.market.next(lane.filters,{...options,session:lane,excludeIds,onResults:()=>{options.onResults?.({...this.present(session,excludeIds,target),searchComplete:false});}});
   }
   const visited=session.lanes.every(l=>sources.every(s=>{const c=l.state.sources[s.id];return c?.done||c?.error||Object.keys(c?.groups||{}).length>=sourceGroups(l.filters,s.adapter).length;}));
   if(!this.hasMore(session)||(this.collect(session,excludeIds,target).items.length>=target&&visited))break;
  }
  session.last=this.present(session,excludeIds,target);return session.last;
 }
 refine(id,raw){const session=this.sessions.get(id);if(!session)throw new Error('Sökningen behöver uppdateras.');session.viewFilters=validateFilters(raw);session.touched=Date.now();return this.present(session,[]);}
 async next(id,excludeIds=[],options={}){const session=this.sessions.get(id);if(!session)throw new Error('Sökningen behöver uppdateras. Gör en ny sökning.');session.touched=Date.now();const local=this.present(session,excludeIds);if(local.items.length>=48||!local.hasMore)return local;return this.fetchMatching(session,excludeIds,options);}
}
module.exports={SearchSessions};

const crypto=require('node:crypto');
const {validateFilters}=require('./core.cjs');
const {sourceGroups}=require('./market.cjs');

// A search starts at the sources' current first pages. SQLite is an ad cache and
// history store; unrelated ads from yesterday are never a new search's results.
class SearchSessions {
  constructor(store,market){this.store=store;this.market=market;this.sessions=new Map();}
  async start(filters={},options={}){
    const now=Date.now();for(const [id,s] of this.sessions)if(now-s.touched>3600000)this.sessions.delete(id);
    const session={id:crypto.randomUUID(),filters:validateFilters(filters),state:{sources:{}},ids:new Set(),queryIds:new Set(),touched:now};
    this.sessions.set(session.id,session);
    const first=await this.fetchMatching(session,options.excludeIds||[],options);
    if(!options.diverse||session.filters.sort!=='priceAsc')return first;
    // Qualitative requests need a spread of current cars, rather than only
    // the cheapest repair objects. Both cohorts obey exactly the user's bounds.
    const alternate=await this.start({...session.filters,sort:'newest'},{...options,diverse:false,onResults:r=>{const items=[...new Map([...first.items,...r.items].map(c=>[c.id,c])).values()];options.onResults?.({...r,items,sessionId:session.id,filters:session.filters,searchComplete:false});}});
    const other=this.sessions.get(alternate.sessionId);for(const id of other.ids)session.ids.add(id);for(const id of other.queryIds)session.queryIds.add(id);this.sessions.delete(other.id);
    const items=[...new Map([...first.items,...alternate.items].map(c=>[c.id,c])).values()].sort((a,b)=>a.price-b.price);
    const total=this.store.search(session.filters,false,0,false,[...session.ids],false,[],[...session.queryIds]).total;
    return {...first,items,total,remaining:Math.max(0,total-items.length),sourceWarning:[first.sourceWarning,alternate.sourceWarning].filter(Boolean).join(' ')||null,hasMore:first.hasMore||alternate.hasMore,marketComplete:first.marketComplete&&alternate.marketComplete};
  }
  async fetchMatching(session,excludeIds,options){
    let result;
    // Finish every source response and fill a useful result page. A single early
    // match must not end retrieval. Source alternatives are visited round-robin.
    const sources=this.store.sources().filter(s=>s.enabled&&s.adapter&&(!(options.sources||session.filters.sources)||(options.sources||session.filters.sources).includes(s.id)));
    const alternatives=Math.max(1,...sources.map(s=>sourceGroups(session.filters,s.adapter).length));
    const maxPages=Math.min(12,Math.max(4,alternatives));
    for(let page=0;page<maxPages;page++){
      result=await this.market.next(session.filters,{...options,session,excludeIds});
      session.last=result;
      const initialAlternativesRead=sources.every(s=>{const c=session.state.sources[s.id];return c?.done||c?.error||Object.keys(c?.groups||{}).length>=sourceGroups(session.filters,s.adapter).length;});
      if(!result.hasMore||(result.items.length>=48&&initialAlternativesRead))break;
    }
    return {...result,searchComplete:true,marketComplete:!result.hasMore&&!result.sourceWarning};
  }
  refine(id,raw){
    const session=this.sessions.get(id);if(!session)throw new Error('Sökningen behöver uppdateras.');
    const filters=validateFilters(raw);session.viewFilters=filters;session.touched=Date.now();
    const local=this.store.search(filters,false,0,false,[...session.ids],false,[],[...session.queryIds]);
    return {...session.last,...local,filters,sessionId:id,remaining:Math.max(0,local.total-local.items.length)};
  }
  async next(id,excludeIds=[],options={}){
    const session=this.sessions.get(id);if(!session)throw new Error('Sökningen behöver uppdateras. Gör en ny sökning.');session.touched=Date.now();
    const filters=session.viewFilters||session.filters;const local=this.store.search(filters,false,0,false,[...session.ids],false,excludeIds,[...session.queryIds]);
    const hasMore=this.store.sources().some(s=>s.enabled&&s.adapter&&(!session.filters.sources||session.filters.sources.includes(s.id))&&!session.state.sources[s.id]?.done&&!session.state.sources[s.id]?.error);
    if(local.items.length>=48||!hasMore){const total=this.store.search(filters,false,0,false,[...session.ids],false,[],[...session.queryIds]).total;return {...session.last,...local,total,filters,sessionId:id,hasMore,searchComplete:true,marketComplete:!hasMore&&!session.last?.sourceWarning,remaining:Math.max(0,local.total-local.items.length)};}
    const next=await this.fetchMatching(session,excludeIds,options);
    if(!session.viewFilters)return next;const refined=this.store.search(filters,false,0,false,[...session.ids],false,excludeIds,[...session.queryIds]);const total=this.store.search(filters,false,0,false,[...session.ids],false,[],[...session.queryIds]).total;return {...next,...refined,total,filters,remaining:Math.max(0,refined.total-refined.items.length)};
  }
}
module.exports={SearchSessions};

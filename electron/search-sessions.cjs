const crypto=require('node:crypto');
const {validateFilters}=require('./core.cjs');

// A search starts at the sources' current first pages. SQLite is an ad cache and
// history store; unrelated ads from yesterday are never a new search's results.
class SearchSessions {
  constructor(store,market){this.store=store;this.market=market;this.sessions=new Map();}
  async start(filters={},options={}){
    const now=Date.now();for(const [id,s] of this.sessions)if(now-s.touched>3600000)this.sessions.delete(id);
    const session={id:crypto.randomUUID(),filters:validateFilters(filters),state:{sources:{}},ids:new Set(),touched:now};
    this.sessions.set(session.id,session);
    return this.fetchMatching(session,options.excludeIds||[],options);
  }
  async fetchMatching(session,excludeIds,options){
    let result;
    // Sources do not all support every filter. Skip a few non-matching pages,
    // then let the user explicitly continue rather than declare a false end.
    for(let page=0;page<3;page++){
      result=await this.market.next(session.filters,{...options,session,excludeIds});
      session.last=result;
      if(result.items.length||!result.hasMore)break;
    }
    return result;
  }
  async next(id,excludeIds=[],options={}){
    const session=this.sessions.get(id);if(!session)throw new Error('Sökningen behöver uppdateras. Gör en ny sökning.');session.touched=Date.now();
    const local=this.store.search(session.filters,false,0,false,[...session.ids],false,excludeIds);
    const hasMore=this.store.sources().some(s=>s.enabled&&s.adapter&&!session.state.sources[s.id]?.done&&!session.state.sources[s.id]?.error);
    if(local.items.length||!hasMore)return {...session.last,...local,filters:session.filters,sessionId:id,hasMore,remaining:Math.max(0,local.total-local.items.length)};
    return this.fetchMatching(session,excludeIds,options);
  }
}
module.exports={SearchSessions};

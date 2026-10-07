class WatchChecker {
  constructor({store,sessions,recommendations,demo=()=>false,changed=()=>{},progress=()=>{}}){Object.assign(this,{store,sessions,recommendations,demo,changed,progress});this.running=null;}
  check(){
    if(this.running)return this.running;
    this.running=this.run().finally(()=>{this.running=null;this.changed();});return this.running;
  }
  async run(){
    const outcomes=[];let profile=null;
    for(const watch of this.store.watches(this.demo())){
      this.progress({watchId:watch.id,status:'running'});
      try{const result=this.demo()?this.store.search(watch.filters,true):await this.sessions.start(watch.filters);const session=this.sessions.sessions?.get(result.sessionId);const ids=session?this.store.search(watch.filters,this.demo(),0,false,[...session.ids],true).ids:result.items?.map(c=>c.id);this.store.watchChecked(watch.id,result.sourceWarning||null,ids);this.changed();if(this.recommendations){profile=profile||await this.recommendations.profile();const candidates=this.store.search(watch.filters,this.demo(),0,false,ids).items;await this.recommendations.rank(candidates,{profile,watch,onResults:items=>{this.store.watchPicks(watch.id,items.slice(0,6));this.changed();}});}outcomes.push({id:watch.id,error:result.sourceWarning||null});}
      catch(e){this.store.watchChecked(watch.id,e.message);outcomes.push({id:watch.id,error:e.message});}
      this.progress({watchId:watch.id,status:'done'});this.changed();
    }
    return {outcomes};
  }
}
module.exports={WatchChecker};

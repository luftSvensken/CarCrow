class WatchChecker {
  constructor({store,sessions,changed=()=>{},progress=()=>{}}){Object.assign(this,{store,sessions,changed,progress});this.running=null;}
  check(){
    if(this.running)return this.running;
    this.running=this.run().finally(()=>{this.running=null;this.changed();});return this.running;
  }
  async run(){
    const outcomes=[];
    for(const watch of this.store.watches(false)){
      this.progress({watchId:watch.id,status:'running'});
      try{const result=await this.sessions.start(watch.filters);const session=this.sessions.sessions?.get(result.sessionId);const ids=session?this.store.search(watch.filters,false,0,false,[...session.ids],true).ids:result.items?.map(c=>c.id);this.store.watchChecked(watch.id,result.sourceWarning||null,ids);outcomes.push({id:watch.id,error:result.sourceWarning||null});}
      catch(e){this.store.watchChecked(watch.id,e.message);outcomes.push({id:watch.id,error:e.message});}
      this.progress({watchId:watch.id,status:'done'});this.changed();
    }
    return {outcomes};
  }
}
module.exports={WatchChecker};

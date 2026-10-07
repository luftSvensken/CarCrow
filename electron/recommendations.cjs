const crypto=require('node:crypto');
const {describeFilters}=require('./services.cjs');
const MODEL='google/embeddinggemma-2';
function document(car){return `${car.make} ${car.model}. ${car.variant}. ${car.bodyType}. Årsmodell ${car.year}. ${car.fuel}. ${car.gearbox}. ${car.mileage} mil. Pris ${car.price} kronor. ${car.description||''}`.slice(0,2200);}
function cosine(a,b){if(!b||a.length!==b.length||!a.length)return -1;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):-1;}
function profileSignals(store,demo=false){
 const chats=store.rows('SELECT data,updated FROM chats ORDER BY updated DESC LIMIT 8').map(r=>({...JSON.parse(r.data),updated:r.updated}));
 const saved=store.search({},demo,0,true).items;
 const events=store.rows('SELECT kind,data,at FROM preference_events ORDER BY id DESC LIMIT 60').map(r=>({...r,data:JSON.parse(r.data)}));
 const recentSearch=events.find(e=>e.kind==='search'),recentChat=chats.find(c=>Object.keys(c.filters||{}).some(k=>k!=='sort'));
 const filters=recentSearch&&(!recentChat||recentSearch.at>recentChat.updated)?recentSearch.data.filters:recentChat?.filters||{};
 const groups=[
  {kind:'chattar',weight:.35,text:chats.map(c=>c.messages?.filter(m=>m.role==='user').slice(-4).map(m=>m.text).join('\n')).filter(Boolean).join('\n')},
  {kind:'sökningar',weight:.25,text:events.filter(e=>e.kind==='search').slice(0,8).map(e=>describeFilters(e.data.filters)).join('\n')},
  {kind:'sparade bilar',weight:.30,text:saved.slice(0,12).map(document).join('\n')},
  {kind:'bilar du utforskat',weight:.10,text:[...new Map(events.filter(e=>e.kind!=='search').map(e=>[e.data.id,e.data.text])).values()].slice(0,10).join('\n')}
 ].filter(g=>g.text).map(g=>({...g,text:g.text.slice(0,2400)}));
 if(!groups.length)groups.push({kind:'ett första urval',weight:1,text:'En prisvärd, praktisk begagnad bil för svenska vardagsresor.'});
 const total=groups.reduce((sum,g)=>sum+g.weight,0);return {groups:groups.map(g=>({...g,weight:g.weight/total})),filters,saved};
}
class Recommendations {
 constructor({store,sessions,runtime,status=()=>{},demo=()=>false}){
  Object.assign(this,{store,sessions,runtime,status,demo});this.listeners=new Set();this.last=null;this.running=null;
  store.db.run('CREATE TABLE IF NOT EXISTS embeddings(vehicle_id TEXT PRIMARY KEY,model TEXT NOT NULL,hash TEXT NOT NULL,vector TEXT NOT NULL)');
  store.db.run('CREATE TABLE IF NOT EXISTS preference_vectors(hash TEXT PRIMARY KEY,vector TEXT NOT NULL)');
 }
 async get({onResults=()=>{}}={}){this.listeners.add(onResults);if(this.last)onResults(this.last);if(!this.running)this.running=this.compute().finally(()=>this.running=null);try{return await this.running;}finally{this.listeners.delete(onResults);}}
 publish(result){for(const listener of this.listeners)listener(result);}
 async query(text){const hash=crypto.createHash('sha256').update((this.runtime.cacheKey||MODEL)+'\nquery\n'+text).digest('hex');const row=this.store.rows('SELECT vector FROM preference_vectors WHERE hash=?',[hash])[0];if(row)return JSON.parse(row.vector);const [vector]=await this.runtime.embed([text],{query:true});this.store.db.run('INSERT OR REPLACE INTO preference_vectors VALUES (?,?)',[hash,JSON.stringify(vector)]);this.store.save();return vector;}
 async profile(){const profile=profileSignals(this.store,this.demo());const vectors=[];for(const group of profile.groups)vectors.push({...group,vector:await this.query(group.text)});return {...profile,vectors};}
 async rank(candidates,{profile,watch,onResults=()=>{}}={}){
  profile=profile||await this.profile();candidates=candidates.slice(0,48);const vectors=new Map(),missing=[],cacheKey=this.runtime.cacheKey||MODEL;
  for(const car of candidates){const text=document(car),hash=crypto.createHash('sha256').update(text).digest('hex');const row=this.store.rows('SELECT vector FROM embeddings WHERE vehicle_id=? AND model=? AND hash=?',[car.id,cacheKey,hash])[0];if(row)vectors.set(car.id,JSON.parse(row.vector));else missing.push({car,text,hash});}
  const watchVector=watch?await this.query(`Jag söker ${watch.name}. Krav: ${describeFilters(watch.filters)}.`):null;
  const reason=watch?'Utvalt för din bevakning':profile.groups.length>1?'Utifrån dina önskemål och bilar du gillar':profile.groups[0].kind==='ett första urval'?'Ett första urval att utforska':'Utifrån dina '+profile.groups[0].kind;
  const sorted=()=>candidates.filter(c=>vectors.has(c.id)).map(car=>{const personal=profile.vectors.reduce((s,g)=>s+g.weight*cosine(g.vector,vectors.get(car.id)),0);return {...car,recommendation:{score:watchVector?.length ? .7*cosine(watchVector,vectors.get(car.id))+.3*personal:personal,reason,model:MODEL}};}).sort((a,b)=>b.recommendation.score-a.recommendation.score);
  if(vectors.size)onResults(sorted());
  for(let offset=0;offset<missing.length;offset+=8){const batch=missing.slice(offset,offset+8),encoded=await this.runtime.embed(batch.map(x=>x.text));for(let i=0;i<batch.length;i++){const {car,hash}=batch[i];vectors.set(car.id,encoded[i]);this.store.db.run('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?)',[car.id,cacheKey,hash,JSON.stringify(encoded[i])]);}this.store.save();onResults(sorted());}
  return sorted();
 }
 async compute(){
  this.status({label:'Förbereder ditt personliga urval'});const profileTask=this.profile(),preferences=profileSignals(this.store,this.demo()),excluded=new Set(preferences.saved.map(c=>c.id));profileTask.catch(()=>{});
  let latest=null,ranking=Promise.resolve(),processing=false;const present=items=>this.publish({items,total:items.length,page:0,filters:preferences.filters,hasMore:false,model:MODEL});
  const consume=()=>{if(processing)return;processing=true;ranking=(async()=>{while(latest){const batch=latest;latest=null;await this.rank(batch.items.filter(c=>!excluded.has(c.id)),{profile:await profileTask,onResults:present});}})().finally(()=>processing=false);ranking.catch(()=>{});};
  this.status({label:'Letar efter aktuella bilar för dig'});
  const result=this.demo()?{...this.store.search(preferences.filters,true),hasMore:false,filters:preferences.filters}:await this.sessions.start(preferences.filters,{onResults:r=>{latest=r;consume();}});
  const profile=await profileTask;await ranking;this.status({label:'Jämför bilar med dina önskemål'});
  const items=await this.rank(result.items.filter(c=>!excluded.has(c.id)),{profile,onResults:present});
  this.last={...result,items,total:items.length,hasMore:false,remaining:0,model:MODEL};this.status({label:'Ditt urval är klart',ready:true});return this.last;
 }
}
module.exports={Recommendations,cosine,document,profileSignals};

const crypto=require('node:crypto');
const MODEL='google/embeddinggemma-2';
function document(car){return `${car.make} ${car.model}. ${car.variant}. ${car.bodyType}. Årsmodell ${car.year}. ${car.fuel}. ${car.gearbox}. ${car.mileage} mil. Pris ${car.price} kronor. ${car.description||''}`.slice(0,3000);}
function cosine(a,b){if(a.length!==b.length||!a.length)return -1;let dot=0,aa=0,bb=0;for(let i=0;i<a.length;i++){dot+=a[i]*b[i];aa+=a[i]*a[i];bb+=b[i]*b[i];}return aa&&bb?dot/Math.sqrt(aa*bb):-1;}
class Recommendations {
 constructor({store,sessions,runtime,status=()=>{},demo=()=>false}){Object.assign(this,{store,sessions,runtime,status,demo});this.store.db.run('CREATE TABLE IF NOT EXISTS embeddings(vehicle_id TEXT PRIMARY KEY,model TEXT NOT NULL,hash TEXT NOT NULL,vector TEXT NOT NULL)');this.running=null;}
 async get(){if(this.running)return this.running;this.running=this.compute().finally(()=>this.running=null);return this.running;}
 async compute(){
  const demo=this.demo(),saved=this.store.search({},demo,0,true).items;
  const chats=this.store.rows('SELECT data FROM chats ORDER BY updated DESC LIMIT 3').map(r=>JSON.parse(r.data));
  const recent=chats.find(c=>Object.keys(c.filters||{}).some(k=>k!=='sort'));
  const filters=recent?.filters||{};
  this.status({label:'Letar efter aktuella bilar för dig'});const result=demo?{...this.store.search(filters,true),hasMore:false,filters}:await this.sessions.start(filters);let candidates=result.items;
  // Fetch another ordinary page when a focused source page is sparse.
  if(candidates.length<12&&result.hasMore){const more=await this.sessions.next(result.sessionId,candidates.map(c=>c.id));candidates=[...candidates,...more.items];}
  const excluded=new Set(saved.map(c=>c.id));candidates=candidates.filter(c=>!excluded.has(c.id));
  if(!candidates.length)return {...result,items:[],hasMore:false,remaining:0,model:MODEL};
  const preferences=saved.length?saved.slice(0,12).map(document).join('\n').slice(0,4000):recent?.messages?.filter(m=>m.role==='user').slice(-2).map(m=>m.text).join('\n')||'En prisvärd, modern och praktisk begagnad bil för svenska vardagsresor.';
  this.status({label:'Jämför bilar med det du gillar'});
  const vectors=new Map(),missing=[];
  for(const car of candidates){const text=document(car),hash=crypto.createHash('sha256').update(text).digest('hex'),cached=this.store.rows('SELECT vector FROM embeddings WHERE vehicle_id=? AND model=? AND hash=?',[car.id,MODEL,hash])[0];if(cached)vectors.set(car.id,JSON.parse(cached.vector));else missing.push({car,text,hash});}
  for(let index=0;index<missing.length;index+=16){const batch=missing.slice(index,index+16);const encoded=await this.runtime.embed(batch.map(x=>x.text));for(let i=0;i<batch.length;i++){const {car,hash}=batch[i];vectors.set(car.id,encoded[i]);this.store.db.run('INSERT OR REPLACE INTO embeddings VALUES (?,?,?,?)',[car.id,MODEL,hash,JSON.stringify(encoded[i])]);}this.store.save();}
  const [profile]=await this.runtime.embed([preferences],{query:true});
  const items=candidates.map(car=>({...car,recommendation:{score:cosine(profile,vectors.get(car.id)),reason:saved.length?'Liknar bilar du sparat':recent?'Passar dina senaste sökningar':'Ett första urval att utforska',model:MODEL}})).sort((a,b)=>b.recommendation.score-a.recommendation.score);
  this.status({label:'Ditt urval är klart',ready:true});return {...result,items,total:items.length,hasMore:false,remaining:0,model:MODEL};
 }
}
module.exports={Recommendations,cosine,document};

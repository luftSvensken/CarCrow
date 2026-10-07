const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{Worker}=require('node:worker_threads');
class EmbeddingRuntime {
 constructor(root,{status=()=>{},modelDir}={}){this.root=root;this.modelDir=modelDir||process.env.CARCROW_EMBED_MODEL||path.join(__dirname,'../models/embeddinggemma-2');this.status=status;try{this.cacheKey='google/embeddinggemma-2:'+crypto.createHash('sha256').update(fs.readFileSync(path.join(this.modelDir,'manifest.json'))).digest('hex');}catch{this.cacheKey='google/embeddinggemma-2:missing';}this.pending=new Map();this.starting=null;this.worker=null;this.state={ready:false,label:'Rekommendationer räknas på din dator'};}
 update(label,extra={}){this.state={...this.state,label,...extra};this.status(this.state);}
 async start(){if(this.state.ready&&this.worker)return;if(this.starting)return this.starting;this.starting=this.boot().finally(()=>this.starting=null);return this.starting;}
 async boot(){
  if(!fs.existsSync(path.join(this.modelDir,'model.onnx')))throw new Error('Den lokala rekommendationsmodellen saknas i appen. Installera det fullständiga CarCrow-paketet.');
  this.update('Startar den lokala rekommendationsmodellen');
  await new Promise((resolve,reject)=>{
   const worker=new Worker(path.join(__dirname,'embedding-worker.cjs'),{workerData:{modelDir:this.modelDir}});this.worker=worker;
   worker.on('message',result=>{
    if(result.type==='ready'){this.update('Rekommendationer körs lokalt på din dator',{ready:true,error:null});resolve();}
    else if(result.type==='error'){this.update('Den lokala modellen kunde inte laddas',{ready:false,error:result.error});reject(new Error(result.error));worker.terminate();}
    else if(result.id){const pending=this.pending.get(result.id);if(pending){this.pending.delete(result.id);result.error?pending.reject(new Error(result.error)):pending.resolve(result.vectors);}}
   });
   worker.on('error',reject);worker.on('exit',()=>{this.worker=null;this.state.ready=false;for(const p of this.pending.values())p.reject(new Error('Den lokala modellmotorn stängdes.'));this.pending.clear();reject(new Error('Den lokala modellmotorn stängdes.'));});
  });
 }
 async embed(texts,{query=false}={}){if(!Array.isArray(texts)||!texts.length||texts.length>100||texts.some(s=>typeof s!=='string'||s.length>6000))throw new Error('Ogiltiga rekommendationsuppgifter.');await this.start();const id=crypto.randomUUID();return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,texts,query});});}
 close(){this.worker?.terminate();this.worker=null;}
}
module.exports={EmbeddingRuntime};

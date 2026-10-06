const {parentPort,workerData}=require('node:worker_threads'),fs=require('node:fs'),path=require('node:path');
(async()=>{
 const ort=require('onnxruntime-node');ort.env.logLevel='error';
 const {Tokenizer}=await import('@huggingface/tokenizers');
 const root=workerData.modelDir,manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
 const tokenizer=new Tokenizer(JSON.parse(fs.readFileSync(path.join(root,'tokenizer.json'),'utf8')),JSON.parse(fs.readFileSync(path.join(root,'tokenizer_config.json'),'utf8')));
 const session=await ort.InferenceSession.create(path.join(root,'model.onnx'),{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1,graphOptimizationLevel:'all'});
 parentPort.postMessage({type:'ready',model:manifest.model});
 parentPort.on('message',async request=>{
  try{
   const encoded=request.texts.map(text=>tokenizer.encode((request.query?manifest.promptQuery:manifest.promptDocument)+text).ids.slice(0,manifest.maxTokens));
   const length=Math.max(...encoded.map(ids=>ids.length)),batch=encoded.length,ids=new BigInt64Array(batch*length),mask=new BigInt64Array(batch*length);
   for(let b=0;b<batch;b++)for(let i=0;i<encoded[b].length;i++){ids[b*length+i]=BigInt(encoded[b][i]);mask[b*length+i]=1n;}
   const result=await session.run({input_ids:new ort.Tensor('int64',ids,[batch,length]),attention_mask:new ort.Tensor('int64',mask,[batch,length])});
   const data=result.embeddings.data,vectors=Array.from({length:batch},(_,i)=>Array.from(data.slice(i*manifest.dimensions,(i+1)*manifest.dimensions)));
   parentPort.postMessage({id:request.id,vectors,model:manifest.model});
  }catch(e){parentPort.postMessage({id:request.id,error:e.message});}
 });
})().catch(e=>parentPort.postMessage({type:'error',error:e.message}));

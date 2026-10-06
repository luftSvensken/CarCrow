const {EmbeddingRuntime}=require('../electron/embedding-runtime.cjs'),{cosine}=require('../electron/recommendations.cjs'),fs=require('node:fs'),path=require('node:path');
const root=process.env.CARCROW_EMBED_TEST_DIR||path.resolve('test-results');
const runtime=new EmbeddingRuntime(root,{status:s=>console.log(s.label)});
(async()=>{try{
 const docs=await runtime.embed(['BMW 320d diesel automat 2017 12000 mil 140000 kronor.','Audi A4 diesel automat 2018 11000 mil 145000 kronor.','Volvo XC90 bensin SUV 2025 1000 mil 900000 kronor.']);const [query]=await runtime.embed(['BMW eller Audi under 150000 kronor, diesel och automat.'],{query:true});
 const scores=docs.map(v=>cosine(query,v));const result={model:'google/embeddinggemma-2',inference:'local',dimensions:docs.map(v=>v.length),scores,finite:docs.every(v=>v.every(Number.isFinite)),status:'passed'};
 if(!result.finite||docs.some(v=>v.length!==256)||Math.max(scores[0],scores[1])<=scores[2])throw new Error('Den verkliga lokala rangordningen blev inte rimlig.');
 fs.mkdirSync(path.resolve('test-results'),{recursive:true});fs.writeFileSync(path.resolve('test-results/embeddinggemma-2.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{runtime.close();}})().catch(e=>{console.error(e.message);process.exitCode=1;});

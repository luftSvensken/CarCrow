const https=require('node:https');
const dns=require('node:dns').promises;
const {StringDecoder}=require('node:string_decoder');
const {privateIP}=require('./services.cjs');

function cancelled(){const e=new Error('Sökningen avbröts.');e.name='AbortError';return e;}
class SSEDecoder {
  constructor(emit){this.emit=emit;this.decoder=new StringDecoder('utf8');this.buffer='';this.data=[];}
  push(chunk){this.buffer+=this.decoder.write(chunk);if(this.buffer.length>1024*1024)throw new Error('För stor strömningshändelse.');this.lines();}
  lines(){let at;while((at=this.buffer.indexOf('\n'))!==-1){const line=this.buffer.slice(0,at).replace(/\r$/,'');this.buffer=this.buffer.slice(at+1);if(!line){if(this.data.length){this.emit(this.data.join('\n'));this.data=[];}}else if(line.startsWith('data:'))this.data.push(line.slice(5).replace(/^ /,''));}}
  end(){this.buffer+=this.decoder.end();this.buffer+='\n\n';this.lines();}
}
async function streamCompletion({key,messages,tools,signal,onDelta,model='openrouter/free',toolChoice='auto'}){
  if(!key)throw new Error('OpenRouter är inte konfigurerat.');
  if(signal?.aborted)throw cancelled();
  const addresses=await dns.lookup('openrouter.ai',{all:true});
  if(addresses.some(x=>privateIP(x.address)))throw new Error('Ogiltig serveradress.');
  const chosen=addresses.find(x=>x.family===4)||addresses[0];
  if(signal?.aborted)throw cancelled();
  return new Promise((resolve,reject)=>{
    let content='',finish=null,usedModel=model,bytes=0;const calls=new Map();
    const req=https.request('https://openrouter.ai/api/v1/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json',Accept:'text/event-stream','X-Title':'CarCrow','User-Agent':'CarCrow/0.3 private desktop'},lookup:(_h,opts,cb)=>opts?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
      if(res.statusCode<200||res.statusCode>=300){res.resume();const e=new Error(res.statusCode===401?'OpenRouter godkände inte appens anslutning.':res.statusCode===429?'OpenRouter Free är tillfälligt begränsat. Försök igen om en stund.':'OpenRouter svarade med HTTP '+res.statusCode+'.');e.status=res.statusCode;reject(e);return;}
      if(!String(res.headers['content-type']).includes('text/event-stream')){res.resume();reject(new Error('OpenRouter returnerade ingen ström.'));return;}
      const parser=new SSEDecoder(data=>{
        if(data==='[DONE]')return;
        const v=JSON.parse(data);if(v.error)throw new Error('OpenRouter avbröt svaret. Försök igen.');
        if(v.model)usedModel=v.model;
        const c=v.choices?.[0];if(!c)return;const d=c.delta||{};
        if(typeof d.content==='string'){content+=d.content;onDelta?.({type:'text',delta:d.content});}
        for(const part of d.tool_calls||[]){const previous=calls.get(part.index)||{id:'',type:'function',function:{name:'',arguments:''}};if(part.id)previous.id=part.id;if(part.function?.name)previous.function.name+=part.function.name;if(part.function?.arguments)previous.function.arguments+=part.function.arguments;if(previous.function.arguments.length>16000)throw new Error('För stort verktygsanrop.');calls.set(part.index,previous);}
        if(c.finish_reason)finish=c.finish_reason;
      });
      res.on('data',chunk=>{try{bytes+=chunk.length;if(bytes>3*1024*1024)throw new Error('AI-svaret är för stort.');parser.push(chunk);}catch(e){req.destroy(e);}});
      res.on('error',reject);
      res.on('end',()=>{try{parser.end();if(!['stop','tool_calls'].includes(finish))throw new Error('AI-svaret blev inte färdigt. Försök igen.');const toolCalls=[...calls.values()];if(finish==='tool_calls'&&!toolCalls.length)throw new Error('AI-verktygsanropet saknas.');resolve({role:'assistant',content:content||null,...(toolCalls.length?{tool_calls:toolCalls}:{}),model:usedModel});}catch(e){reject(e);}});
    });
    const abort=()=>req.destroy(cancelled());signal?.addEventListener('abort',abort,{once:true});
    const deadline=setTimeout(()=>req.destroy(new Error('OpenRouter Free kunde inte slutföra svaret inom två minuter. Försök igen.')),120000);deadline.unref();req.once('close',()=>{clearTimeout(deadline);signal?.removeEventListener('abort',abort);});req.on('error',reject);req.setTimeout(75000,()=>req.destroy(new Error('OpenRouter Free svarar långsamt. Försök igen.')));
    req.end(JSON.stringify({model,messages,tools,tool_choice:toolChoice,stream:true,temperature:0.2,max_tokens:4096}));
  });
}
module.exports={SSEDecoder,streamCompletion,cancelled};

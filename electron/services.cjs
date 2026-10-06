const https = require('node:https');
const dns = require('node:dns').promises;
const net = require('node:net');
const { validateFilters,httpsURL } = require('./core.cjs');

function privateIP(ip) {
  if(ip.includes(':'))return ip==='::1'||ip==='::'||/^f[cd]/i.test(ip)||/^fe[89ab]/i.test(ip)||/^::ffff:/i.test(ip);
  const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);
}
// Resolve and pin every connection. Follow only ordinary HTTPS canonical redirects on the same host.
async function requestJSON(url, {headers={},body=null,maxBytes=20*1024*1024,timeout=30000,kind='json',signal,redirects=0}={}) {
  if(signal?.aborted){const e=new Error('Sökningen avbröts.');e.name='AbortError';throw e;}
  const u=new URL(httpsURL(url));
  if(u.port&&u.port!=='443')throw new Error('Anslutningen måste använda HTTPS-port 443.');
  const hostname=u.hostname.replace(/^\[|\]$/g,'');
  const addresses=net.isIP(hostname)?[{address:hostname,family:net.isIP(hostname)}]:await dns.lookup(hostname,{all:true});
  if(!addresses.length||addresses.some(x=>privateIP(x.address)))throw new Error('Lokala nätverksadresser stöds inte som datakälla.');
  const chosen=addresses.find(x=>x.family===4)||addresses[0];
  return new Promise((resolve,reject)=>{
    const req=https.request(u,{method:body?'POST':'GET',headers:{'User-Agent':'CarCrow/0.1 (private-desktop-client)','Accept':kind==='html'?'text/html':'application/json',...headers},lookup:(_h,opts,cb)=>opts?.all?cb(null,[chosen]):cb(null,chosen.address,chosen.family)},res=>{
      if([301,302,303,307,308].includes(res.statusCode)&&kind==='html'&&!body&&res.headers.location){
        res.resume();try{const next=new URL(res.headers.location,u);if(next.origin!==u.origin||redirects>=3)throw new Error('Källans omdirigering stöds inte.');resolve(requestJSON(next.href,{headers,body,maxBytes,timeout,kind,signal,redirects:redirects+1}));}catch(e){reject(e);}return;
      }
      if(res.statusCode<200||res.statusCode>=300){res.resume();const e=new Error('Tjänsten svarade med HTTP '+res.statusCode+'. Ingen data importerades.');e.status=res.statusCode;reject(e);return;}
      const contentType=String(res.headers['content-type']||'').toLowerCase();
      if(!(kind==='text'?/javascript|text\/plain/.test(contentType):contentType.includes(kind==='html'?'text/html':'json'))){res.resume();reject(new Error('Källan returnerade ett oväntat innehållsformat.'));return;}
      const chunks=[];let size=0;res.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){req.destroy(new Error('Svaret är för stort.'));return;}chunks.push(chunk);});
      res.on('end',()=>{try{const text=Buffer.concat(chunks).toString('utf8');resolve(kind!=='json'?text:JSON.parse(text));}catch{reject(new Error('Tjänsten returnerade ogiltig JSON.'));}});
      res.on('error',reject);
    });
    const abort=()=>{const e=new Error('Sökningen avbröts.');e.name='AbortError';req.destroy(e);};signal?.addEventListener('abort',abort,{once:true});req.once('close',()=>signal?.removeEventListener('abort',abort));if(signal?.aborted)abort();
    req.setTimeout(timeout,()=>req.destroy(new Error('Tjänsten svarade inte i tid. Försök igen.')));req.on('error',reject);
    if(body)req.write(JSON.stringify(body));req.end();
  });
}
const nullableInt={type:['integer','null'],minimum:0};
const FILTER_SCHEMA={type:'object',additionalProperties:false,properties:{
  makes:{type:'array',items:{type:'string'}},models:{type:'array',items:{type:'string'}},
  minPrice:nullableInt,maxPrice:nullableInt,minYear:nullableInt,maxYear:nullableInt,maxMileage:nullableInt,
  fuelTypes:{type:'array',items:{type:'string',enum:['Bensin','Diesel','El','Laddhybrid','Hybrid','Etanol','Gas']}},
  gearbox:{type:['string','null'],enum:['Automat','Manuell',null]},query:{type:['string','null']},
  sort:{type:'string',enum:['newest','priceAsc','priceDesc','mileage','deals']}
},required:['makes','models','minPrice','maxPrice','minYear','maxYear','maxMileage','fuelTypes','gearbox','query','sort']};
function describeFilters(f) {
  return [f.makes?.join(' eller '),f.models?.join(' eller '),f.maxPrice!=null?`högst ${f.maxPrice.toLocaleString('sv-SE')} kr`:null,f.minPrice!=null?`minst ${f.minPrice.toLocaleString('sv-SE')} kr`:null,f.gearbox,f.maxMileage!=null?`max ${f.maxMileage.toLocaleString('sv-SE')} mil`:null,f.fuelTypes?.join(' eller '),f.minYear?`från ${f.minYear}`:null,f.maxYear?`till ${f.maxYear}`:null,f.query].filter(Boolean).join(' · ')||'Alla insamlade bilar';
}
module.exports={requestJSON,describeFilters,privateIP,FILTER_SCHEMA};

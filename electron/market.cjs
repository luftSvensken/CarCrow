const crypto=require('node:crypto');
const cheerio=require('cheerio');
const {requestJSON}=require('./services.cjs');
const {validateFilters,normalizeListing}=require('./core.cjs');
const {buildURL,parseCar}=require('./blocket.cjs');
const {listURL,listLinks,parseDetail}=require('./html-sources.cjs');
const {cancelled}=require('./stream.cjs');
const {riddermarkPage,riddermarkDetail,riddermarkURL,kvdPage,kvdURL}=require('./dealer-sources.cjs');
function scopeKey(filters){const f=validateFilters(filters);return 'market:'+crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(f).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');}
function nextHTMLPage(html,id,url){
  const $=cheerio.load(html),current=new URL(url),page=Number(current.searchParams.get(id==='bytbil'?'Page':'page')||1);
  if(id==='bilweb'){
    const data=$('#page-data'),actual=Number(data.attr('data-current-page')||page),last=Number(data.attr('data-total-pages')||1);
    if(actual>=last)return null;
    // The site's ordinary “Visa fler” control requests /sok with its full filters.
    const next=new URL('https://bilweb.se/sok');next.search=current.search;
    if(current.pathname.startsWith('/sok/')&&!next.searchParams.has('make')){
      const label=$('[data-filter-type="make"]').toArray().find(e=>$(e).attr('data-slug')===current.pathname.split('/')[2]);
      if(label)next.searchParams.set('make',$(label).attr('value'));
      else next.pathname=current.pathname;
    }
    next.searchParams.set('page',String(actual+1));return next.href;
  }
  const candidates=$('a[href]').toArray().map(e=>{try{const next=new URL($(e).attr('href'),url),n=Number(next.searchParams.get(id==='bytbil'?'Page':'page'));return next.origin===current.origin&&(next.pathname===current.pathname||id==='wayke'&&next.pathname.startsWith('/sok/'))&&n>page?{url:next.href,page:n}:null;}catch{return null;}}).filter(Boolean).sort((a,b)=>a.page-b.page);
  return candidates[0]?.url||null;
}
class Market {
  constructor(store,{request=requestJSON}={}){this.store=store;this.request=request;this.jobs=new Map();}
  coverage(filters={}){return this.store.setting(scopeKey(filters))||{sources:{}};}
  reset(filters={}){this.store.setSetting(scopeKey(filters),{sources:{}});}
  async next(filters={}, {signal,onProgress=()=>{},sources:onlySources,fresh=false,excludeIds=[],session}={}){
    if(signal?.aborted)throw cancelled();const f=validateFilters(filters),key=scopeKey(f),jobKey=key+':'+(session?.id||'')+':'+(fresh?'fresh':'crawl')+':'+(onlySources||[]).join(',');
    let job=this.jobs.get(jobKey);
    if(!job){
      job={controller:new AbortController(),listeners:new Set(),subscribers:0};this.jobs.set(jobKey,job);
      job.promise=Promise.resolve().then(()=>this.fetchPage(f,{signal:job.controller.signal,onProgress:e=>{for(const listener of job.listeners)listener(e);},sources:onlySources,fresh,session})).finally(()=>this.jobs.delete(jobKey));
    }
    job.subscribers++;job.listeners.add(onProgress);
    return new Promise((resolve,reject)=>{
      let settled=false;const cleanup=()=>{job.listeners.delete(onProgress);job.subscribers--;signal?.removeEventListener('abort',abort);};
      const abort=()=>{if(settled)return;settled=true;cleanup();if(!job.subscribers)job.controller.abort();reject(cancelled());};signal?.addEventListener('abort',abort,{once:true});
      job.promise.then(result=>{if(settled)return;settled=true;cleanup();if(session)for(const id of result.vehicleIds||[])session.ids.add(id);const selected=session?[...session.ids]:null;const unseen=this.store.search(f,false,0,false,selected,false,excludeIds);resolve({...result,...unseen,total:this.store.search(f,false,0,false,selected).total,remaining:Math.max(0,unseen.total-unseen.items.length),filters:f,sessionId:session?.id});},e=>{if(settled)return;settled=true;cleanup();reject(e);});
      if(signal?.aborted)abort();
    });
  }
  async fetchPage(f,{signal,onProgress,sources:onlySources,fresh,session}){
    const key=scopeKey(f),state=session?.state||(fresh?{sources:{}}:this.coverage(f)),sources=this.store.sources().filter(s=>s.enabled&&s.adapter&&(!onlySources||onlySources.includes(s.id)));
    const settled=await Promise.allSettled(sources.map(async source=>{
      const groups=f.makes?.length?f.makes:[null];let cursor=state.sources[source.id]||{page:1,group:0,done:false,received:0,pages:0};
      if(cursor.done)return {source:source.name,done:true,received:0};
      try{
        if(signal.aborted)throw cancelled();this.store.checkSource(source);
        onProgress({type:'source',source:source.name,status:'running',label:'Söker på '+source.name,page:cursor.page});
        let ads=[],nextURL=null,total=null,signature,limited=false;
        if(source.adapter==='blocket-public'){
          const r=await this.request(buildURL(f,cursor.page),{signal});if(!Array.isArray(r.docs))throw new Error('Källans sökformat har ändrats.');
          for(const d of r.docs)if(d.sales_form!=null&&d.sales_form!==1||/(?:vi köper|köpes|köper din|privatleasing)/i.test(d.heading+' '+(d.model_specification||'')))this.store.excludeListing(source.id+':'+d.id);
          total=r.metadata?.result_size?.match_count??r.total??null;signature=r.docs.map(d=>String(d.id)).join(',');ads=r.docs.map(parseCar).filter(Boolean);
          const last=r.metadata?.paging?.last||Infinity,end=!r.docs.length||r.metadata?.is_end_of_paging||cursor.page>=last;
          limited=Number.isFinite(last)&&total>last*r.docs.length;nextURL=end?null:buildURL(f,cursor.page+1);
          // Preserve previously inspected descriptions when the search API omits them.
          ads=ads.map(ad=>{const old=this.store.rows('SELECT data FROM listings WHERE id=?',[source.id+':'+ad.id])[0];return old?{...JSON.parse(old.data),...ad,description:ad.description||JSON.parse(old.data).description}:ad;});
        }else if(source.adapter==='kvd-public'){
          const parsed=kvdPage(await this.request(kvdURL(f,cursor.page,groups[cursor.group]),{signal}));ads=parsed.listings;total=parsed.total;signature=ads.map(x=>x.id).join(',');nextURL=parsed.count>=20?kvdURL(f,cursor.page+1,groups[cursor.group]):null;
        }else if(source.adapter==='riddermark-public'){
          const url=riddermarkURL(f,cursor.page,groups[cursor.group]),html=await this.request(url,{kind:'html',signal});const parsed=riddermarkPage(html);ads=parsed.listings;signature=ads.map(x=>x.id).join(',');nextURL=parsed.count>=39?riddermarkURL(f,cursor.page+1,groups[cursor.group]):null;
        }else{
          const url=cursor.nextURL||listURL(source.id,f,groups[cursor.group]);const html=await this.request(url,{kind:'html',signal});const links=listLinks(html,source.id);signature=links.join(',');
          if(!links.length&&!/(?:0\s+(?:Personbilar|bilar|träffar|resultat|annonser)|Inga fordon matchade sökningen)/i.test(html))throw new Error('Annonslistan kunde inte läsas.');
          nextURL=nextHTMLPage(html,source.id,url);if(source.id==='bilweb')total=Number(cheerio.load(html)('#page-data').attr('data-total'))||null;
          let index=0,completed=0;const failures=[];
          const workers=await Promise.allSettled(Array.from({length:Math.min(3,links.length)},async()=>{
            while(index<links.length){
              if(signal.aborted)throw cancelled();const detailURL=links[index++];
              try{const body=await this.request(detailURL,{kind:'html',signal}),ad=parseDetail(source.id,body,detailURL);if(ad&&!ad.inactive){normalizeListing(ad,source);ads.push(ad);this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[ad]});}}
              catch(e){if(e.name==='AbortError')throw e;if(e.status!==404&&e.status!==410)failures.push(e.message);}
              completed++;onProgress({type:'source',source:source.name,status:'running',label:source.name+' · '+completed+'/'+links.length+' annonser',page:cursor.page,received:ads.length});
            }
          }));
          if(signal.aborted||workers.some(r=>r.status==='rejected'&&r.reason.name==='AbortError'))throw cancelled();
          if(failures.length===links.length&&links.length)throw new Error(failures[0]);
        }
        if(signal.aborted)throw cancelled();if(signature&&signature===cursor.signature)nextURL=null;
        const valid=ads.filter(ad=>{try{normalizeListing(ad,source);return true;}catch{return false;}});
        if(['blocket-public','riddermark-public','kvd-public'].includes(source.adapter))this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:valid});
        let next={...cursor,page:cursor.page+1,nextURL,signature,total:total??cursor.total,pages:cursor.pages+1,received:cursor.received+valid.length,error:null,limited,done:!nextURL};
        if(source.adapter!=='blocket-public'&&!nextURL&&cursor.group<groups.length-1)next={...next,group:cursor.group+1,page:1,nextURL:null,signature:null,done:false};
        state.sources[source.id]=next;if(!fresh&&!session)this.store.setSetting(key,state);this.store.sourceStatus(source.id,null,true);
        onProgress({type:'source',source:source.name,status:'done',label:source.name+' · '+valid.length+' annonser',received:valid.length,page:cursor.page});
        const listingIds=valid.map(ad=>source.id+':'+ad.id);
        const vehicleIds=this.store.rows('SELECT DISTINCT vehicle_id FROM listings WHERE id IN (SELECT value FROM json_each(?))',[JSON.stringify(listingIds)]).map(row=>row.vehicle_id);
        return {source:source.name,received:valid.length,done:next.done,total:next.total||null,limited,vehicleIds};
      }catch(e){if(e.name==='AbortError')throw e;this.store.sourceStatus(source.id,e.message);state.sources[source.id]={...cursor,error:e.message};if(!fresh&&!session)this.store.setSetting(key,state);onProgress({type:'source',source:source.name,status:'error',label:source.name+' kunde inte hämtas',error:e.message});return {source:source.name,error:e.message,done:false};}
    }));
    if(!fresh&&!session)this.store.setSetting(key,state);
    if(signal.aborted)throw cancelled();const rejected=settled.find(x=>x.status==='rejected');if(rejected)throw rejected.reason;
    return {coverage:state.sources,vehicleIds:[...new Set(settled.flatMap(x=>x.value.vehicleIds||[]))],hasMore:sources.some(s=>!state.sources[s.id]?.done&&!state.sources[s.id]?.error),sourceWarning:settled.map(x=>x.value).filter(x=>x.error).map(x=>x.source+': '+x.error).join(' ')||null,outcomes:settled.map(x=>x.value)};
  }
  async inspect(id,{signal,onProgress=()=>{}}={}){
    const before=this.store.detail(id),checks=[];
    for(const offer of before.offers){
      if(signal?.aborted)throw cancelled();const source=this.store.sources().find(s=>s.id===offer.sourceId);if(!source?.enabled||!source.adapter)continue;this.store.checkSource(source);
      const row=this.store.rows('SELECT data FROM listings WHERE id=?',[offer.id])[0];if(!row)continue;const old=JSON.parse(row.data);
      onProgress({type:'source',source:source.name,status:'running',label:'Öppnar annonsen på '+source.name});
      try{
        let ad;
        if(source.adapter==='blocket-public'){
          const r=await this.request('https://blocket-api.se/v1/ad/car?id='+encodeURIComponent(old.id),{signal});
          if(String(r.ad_id)!==String(old.id)||!r.title||!r.price)throw new Error('Originalannonsen kunde inte verifieras.');
          const price=Number(String(r.price).replace(/[^0-9]/g,''));ad={...old,title:r.title,price:price>0?price:old.price,description:r.equipment?.length?'Utrustning enligt annonsen:\n'+r.equipment.join(' · '):old.description};
        }else if(source.adapter==='riddermark-public'){
          ad=riddermarkDetail(await this.request(old.url,{kind:'html',signal}),old.url);if(!ad)throw new Error('Originalannonsen saknar ett aktivt försäljningspris.');
        }else ad=parseDetail(source.id,await this.request(old.url,{kind:'html',signal}),old.url);
        if(ad?.inactive)this.store.removeListing(offer.id);else if(ad)this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...ad,publishedAt:old.publishedAt}]});else throw new Error('Originalannonsen saknar verifierbara biluppgifter.');
        checks.push({source:source.name,status:ad.inactive?'removed':'verified'});onProgress({type:'source',source:source.name,status:'done',label:source.name+' · annonsen läst'});
      }catch(e){if(e.name==='AbortError')throw e;if(e.status===404||e.status===410){this.store.removeListing(offer.id);checks.push({source:source.name,status:'removed'});}else checks.push({source:source.name,status:'error',error:e.message});onProgress({type:'source',source:source.name,status:'error',label:source.name+' · annonsen kunde inte verifieras'});}
    }
    return {...this.store.detail(id),checks};
  }
}
module.exports={Market,nextHTMLPage,scopeKey};

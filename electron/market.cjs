const crypto=require('node:crypto');
const cheerio=require('cheerio');
const {requestJSON}=require('./services.cjs');
const {validateFilters,normalizeListing}=require('./core.cjs');
const {buildURL,parseCar,originalDescription}=require('./blocket.cjs');
const {saleIssue,cashSaleAssessment,cashAmount}=require('./sale-quality.cjs');
const {listURL,listLinks,parseDetail}=require('./html-sources.cjs');
const {cancelled}=require('./stream.cjs');
const {riddermarkPage,riddermarkDetail,riddermarkURL,kvdPage,kvdURL}=require('./dealer-sources.cjs');
const {correctQuery,terms}=require('./search-query.cjs');
function sourceGroups(f,adapter){
 const queries=f.query?correctQuery(f.query).split(/\s+(?:eller|or)\s+/):[null];
 const models=adapter==='kvd-public'?[null]:f.models?.length?f.models:[null];
 if(adapter==='kvd-public')queries.splice(0,queries.length,null);
 const {tokens,brandToken}=require('./brands.cjs');const known=(f.makes||[]).filter(m=>tokens.includes(brandToken(require('./search-query.cjs').normalize(m))));const unknown=(f.makes||[]).filter(m=>!known.includes(m));const makes=adapter==='blocket-public'?(f.makes?.length?[...(known.length?[known]:[]),...unknown.map(m=>[m])]:[[]]):(f.makes?.length?f.makes:[null]).map(make=>make?[make]:[]);
 return makes.flatMap(m=>models.flatMap(model=>queries.map(query=>({...f,makes:m,models:model?[model]:[],query:query||undefined}))));
}
function scopeKey(filters){const f=validateFilters(filters);return 'market:'+crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.entries(f).sort(([a],[b])=>a.localeCompare(b))))).digest('hex');}
function nextHTMLPage(html,id,url){
  const $=cheerio.load(html),current=new URL(url),page=Number(current.searchParams.get(id==='bytbil'?'Page':'page')||1);
  const candidates=$('a[href]').toArray().map(e=>{try{const next=new URL($(e).attr('href'),url),n=Number(next.searchParams.get(id==='bytbil'?'Page':'page'));return next.origin===current.origin&&(next.pathname===current.pathname||id==='wayke'&&next.pathname.startsWith('/sok/'))&&n>page?{url:next.href,page:n}:null;}catch{return null;}}).filter(Boolean).sort((a,b)=>a.page-b.page);
  return candidates[0]?.url||null;
}
class Market {
  constructor(store,{request=requestJSON}={}){this.store=store;this.request=request;this.jobs=new Map();}
  coverage(filters={}){return this.store.setting(scopeKey(filters))||{sources:{}};}
  reset(filters={}){this.store.setSetting(scopeKey(filters),{sources:{}});}
  async next(filters={}, {signal,onProgress=()=>{},onResults=()=>{},sources:onlySources,fresh=false,excludeIds=[],session}={}){
    if(signal?.aborted)throw cancelled();const f=validateFilters(filters),key=scopeKey(f),jobKey=key+':'+(session?.id||'')+':'+(fresh?'fresh':'crawl')+':'+(onlySources||[]).join(',');
    let job=this.jobs.get(jobKey);
    if(!job){
      job={controller:new AbortController(),listeners:new Set(),batches:new Set(),ids:new Set(),queryIds:new Set(),subscribers:0};this.jobs.set(jobKey,job);
      job.promise=Promise.resolve().then(()=>this.fetchPage(f,{signal:job.controller.signal,onProgress:e=>{for(const listener of job.listeners)listener(e);},onBatch:(ids,queryConfirmed=false)=>{for(const id of ids){job.ids.add(id);session?.ids.add(id);if(queryConfirmed){job.queryIds.add(id);session?.queryIds.add(id);}}for(const listener of job.batches)listener();},sources:onlySources||f.sources,fresh,session})).finally(()=>this.jobs.delete(jobKey));
    }
    job.subscribers++;job.listeners.add(onProgress);
    let timer=null;const publish=()=>{timer=null;if(signal?.aborted)return;const display=session?.viewFilters||f;const partial=this.store.search(display,false,0,false,session?[...session.ids]:[...job.ids],false,excludeIds,session?[...session.queryIds]:[...job.queryIds]);if(partial.items.length)onResults({...partial,filters:display,sessionId:session?.id,hasMore:true,searchComplete:false,remaining:Math.max(0,partial.total-partial.items.length)});};
    const batch=()=>{if(!timer)timer=setTimeout(publish,80);};job.batches.add(batch);
    return new Promise((resolve,reject)=>{
      let settled=false;const cleanup=()=>{clearTimeout(timer);job.batches.delete(batch);job.listeners.delete(onProgress);job.subscribers--;signal?.removeEventListener('abort',abort);};
      const abort=()=>{if(settled)return;settled=true;cleanup();if(!job.subscribers)job.controller.abort();reject(cancelled());};signal?.addEventListener('abort',abort,{once:true});
      job.promise.then(result=>{if(settled)return;settled=true;cleanup();if(session)for(const id of result.vehicleIds||[])session.ids.add(id);const selected=session?[...session.ids]:null,queryIds=session?[...session.queryIds]:[...job.queryIds];const display=session?.viewFilters||f;const unseen=this.store.search(display,false,0,false,selected,false,excludeIds,queryIds);const complete={...result,...unseen,total:this.store.search(display,false,0,false,selected,false,[],queryIds).total,remaining:Math.max(0,unseen.total-unseen.items.length),filters:display,sessionId:session?.id};onResults({...complete,searchComplete:false});resolve(complete);},e=>{if(settled)return;settled=true;cleanup();reject(e);});
      if(signal?.aborted)abort();
    });
  }
  async fetchPage(f,{signal,onProgress,onBatch=()=>{},sources:onlySources,fresh,session}){
    const key=scopeKey(f),state=session?.state||(fresh?{sources:{}}:this.coverage(f)),sources=this.store.sources().filter(s=>s.enabled&&s.adapter&&(!onlySources||onlySources.includes(s.id)));
    const imported=(source,ads)=>this.store.rows('SELECT DISTINCT vehicle_id FROM listings WHERE id IN (SELECT value FROM json_each(?))',[JSON.stringify(ads.map(ad=>source.id+':'+ad.id))]).map(r=>r.vehicle_id);
    const settled=await Promise.allSettled(sources.map(async source=>{
      const groups=sourceGroups(f,source.adapter),previous=state.sources[source.id]||{group:0,groups:{},done:false};
      if(previous.done)return {source:source.name,done:true,received:0};
      if(previous.error)return {source:source.name,error:previous.error,done:false};
      const group=Array.from({length:groups.length},(_,i)=>(previous.group+i)%groups.length).find(i=>!previous.groups?.[i]?.done);
      const cursor=previous.groups?.[group]||{page:1,done:false,received:0,pages:0};
      const scoped=groups[group]||f,make=scoped.makes?.[0]||null;
      try{
        if(signal.aborted)throw cancelled();this.store.checkSource(source);
        onProgress({type:'source',source:source.name,status:'running',label:'Söker på '+source.name,page:cursor.page});
        let ads=[],nextURL=null,total=null,signature,limited=false,pendingLinks=[],pageSize=cursor.pageSize||0;
        if(source.adapter==='blocket-public'){
          const r=await this.request(buildURL(scoped,cursor.page),{signal});if(!Array.isArray(r.docs))throw new Error('Källans sökformat har ändrats.');
          for(const d of r.docs)if(d.price?.amount<=100||d.sales_form!=null&&d.sales_form!==1||/(?:vi köper|köpes|köper din|privatleasing)/i.test(d.heading+' '+(d.model_specification||'')))this.store.excludeListing(source.id+':'+d.id);
          total=r.metadata?.result_size?.match_count??r.total??null;signature=r.docs.map(d=>String(d.id)).join(',');ads=r.docs.map(parseCar).filter(Boolean);
          const last=r.metadata?.paging?.last||Infinity,end=!r.docs.length||r.metadata?.is_end_of_paging||cursor.page>=last;
          pageSize=Math.max(pageSize,r.docs.length);limited=Number.isFinite(last)&&total>last*pageSize;nextURL=end?null:buildURL(scoped,cursor.page+1);
          // Preserve previously inspected descriptions when the search API omits them.
          ads=ads.map(ad=>{const old=this.store.rows('SELECT data FROM listings WHERE id=?',[source.id+':'+ad.id])[0];return old?{...JSON.parse(old.data),...ad,description:ad.description||JSON.parse(old.data).description}:ad;});
          // A very low advertised price on a recent car can be a lease payment.
          // Verify the seller's text; the price alone never excludes a real sale.
          let inspectIndex=0;const suspicious=ads.filter(ad=>cashSaleAssessment(ad).needsVerification);
          await Promise.all(Array.from({length:Math.min(3,suspicious.length)},async()=>{while(inspectIndex<suspicious.length){const ad=suspicious[inspectIndex++];try{ad.description=originalDescription(await this.request(ad.url,{kind:'html',timeout:6000,signal}));}catch(e){if(e.name==='AbortError')throw e;}}}));
          ads=ads.filter(ad=>{if(!saleIssue(ad))return true;this.store.excludeListing(source.id+':'+ad.id);return false;});
        }else if(source.adapter==='kvd-public'){
          const parsed=kvdPage(await this.request(kvdURL(scoped,cursor.page,make),{signal}));ads=parsed.listings;total=parsed.total;signature=ads.map(x=>x.id).join(',');nextURL=parsed.count>=20&&(!Number.isFinite(total)||cursor.page*20<total)?kvdURL(scoped,cursor.page+1,make):null;
        }else if(source.adapter==='riddermark-public'){
          const url=riddermarkURL(scoped,cursor.page,make),html=await this.request(url,{kind:'html',signal});const parsed=riddermarkPage(html);ads=parsed.listings;signature=ads.map(x=>x.id).join(',');nextURL=parsed.count>=39?riddermarkURL(scoped,cursor.page+1,make):null;
        }else{
          let links;if(cursor.pendingLinks?.length){links=cursor.pendingLinks;nextURL=cursor.nextURL;signature=cursor.signature;}else{
            const url=cursor.nextURL||listURL(source.id,scoped,make),html=await this.request(url,{kind:'html',signal});links=listLinks(html,source.id);signature=links.join(',');
            if(!links.length&&!/(?:0\s+(?:Personbilar|bilar|träffar|resultat|annonser)|Inga fordon matchade sökningen)/i.test(html))throw new Error('Annonslistan kunde inte läsas.');
            nextURL=nextHTMLPage(html,source.id,url);
          }
          pendingLinks=links.slice(12);links=links.slice(0,12);
          let index=0,completed=0;const failures=[];
          const workers=await Promise.allSettled(Array.from({length:Math.min(3,links.length)},async()=>{
            while(index<links.length){
              if(signal.aborted)throw cancelled();const detailURL=links[index++];
              try{const body=await this.request(detailURL,{kind:'html',signal}),ad=parseDetail(source.id,body,detailURL);if(ad?.excluded)this.store.excludeListing(source.id+':'+ad.id);else if(ad&&!ad.inactive){normalizeListing(ad,source);ads.push(ad);this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[ad]});onBatch(imported(source,[ad]));}}
              catch(e){if(e.name==='AbortError')throw e;if(e.status!==404&&e.status!==410)failures.push(e.message);}
              completed++;onProgress({type:'source',source:source.name,status:'running',label:source.name+' · '+completed+'/'+links.length+' annonser',page:cursor.page,received:ads.length});
            }
          }));
          if(signal.aborted||workers.some(r=>r.status==='rejected'&&r.reason.name==='AbortError'))throw cancelled();
          if(failures.length===links.length&&links.length)throw new Error(failures[0]);
        }
        if(signal.aborted)throw cancelled();if(!cursor.pendingLinks?.length&&signature&&signature===cursor.signature)nextURL=null;
        const valid=ads.filter(ad=>{try{normalizeListing(ad,source);return true;}catch{return false;}});
        if(['blocket-public','riddermark-public','kvd-public'].includes(source.adapter)){this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:valid});onBatch(imported(source,valid),source.adapter==='blocket-public'&&terms(f.query||'').length>0);}
        const groupNext={...cursor,page:cursor.page+(pendingLinks.length?0:1),pendingLinks,pageSize,nextURL,signature,total:total??cursor.total,pages:cursor.pages+1,received:cursor.received+valid.length,error:null,limited:limited||cursor.limited,done:!nextURL&&!pendingLinks.length};
        const cursors={...(previous.groups||{}),[group]:groupNext};
        const next={...groupNext,group:(group+1)%groups.length,groups:cursors,
          pages:Object.values(cursors).reduce((n,c)=>n+c.pages,0),received:Object.values(cursors).reduce((n,c)=>n+c.received,0),
          limited:Object.values(cursors).some(c=>c.limited),done:groups.every((_,i)=>cursors[i]?.done),total:groups.every((_,i)=>Number.isFinite(cursors[i]?.total))?Object.values(cursors).reduce((n,c)=>n+c.total,0):null};
        state.sources[source.id]=next;if(!fresh&&!session)this.store.setSetting(key,state);this.store.sourceStatus(source.id,null,true);
        onProgress({type:'source',source:source.name,status:'done',label:source.name+' · '+valid.length+' annonser',received:valid.length,page:cursor.page});
        const listingIds=valid.map(ad=>source.id+':'+ad.id);
        const vehicleIds=this.store.rows('SELECT DISTINCT vehicle_id FROM listings WHERE id IN (SELECT value FROM json_each(?))',[JSON.stringify(listingIds)]).map(row=>row.vehicle_id);
        return {source:source.name,received:valid.length,done:next.done,total:next.total||null,limited,vehicleIds};
      }catch(e){if(e.name==='AbortError')throw e;this.store.sourceStatus(source.id,e.message);state.sources[source.id]={...previous,error:e.message};if(!fresh&&!session)this.store.setSetting(key,state);onProgress({type:'source',source:source.name,status:'error',label:source.name+' kunde inte hämtas',error:e.message});return {source:source.name,error:e.message,done:false};}
    }));
    if(!fresh&&!session)this.store.setSetting(key,state);
    if(signal.aborted)throw cancelled();const rejected=settled.find(x=>x.status==='rejected');if(rejected)throw rejected.reason;
    return {coverage:state.sources,vehicleIds:[...new Set(settled.flatMap(x=>x.value.vehicleIds||[]))],hasMore:sources.some(s=>!state.sources[s.id]?.done&&!state.sources[s.id]?.error),sourceWarning:settled.map(x=>x.value).filter(x=>x.error).map(x=>x.source+': '+x.error).join(' ')||null,outcomes:settled.map(x=>x.value)};
  }
  async inspect(id,{signal,onProgress=()=>{}}={}){
    const before=this.store.detail(id),checks=[];
    for(const offer of before.offers){
      if(signal?.aborted)throw cancelled();const source=this.store.sources().find(s=>s.id===offer.sourceId);if(!source?.enabled||(!source.adapter&&!source.webVerified))continue;this.store.checkSource(source);
      const row=this.store.rows('SELECT data FROM listings WHERE id=?',[offer.id])[0];if(!row)continue;const old=JSON.parse(row.data);
      onProgress({type:'source',source:source.name,status:'running',label:'Öppnar annonsen på '+source.name});
      try{
        let ad;
        if(source.adapter==='blocket-public'){
          const r=await this.request('https://blocket-api.se/v1/ad/car?id='+encodeURIComponent(old.id),{signal});
          if(String(r.ad_id)!==String(old.id)||!r.title||!r.price)throw new Error('Originalannonsen kunde inte verifieras.');
          const price=cashAmount(r.price);if(!price){this.store.excludeListing(offer.id);checks.push({source:source.name,status:'excluded',error:'Originalet saknar ett tydligt kontantpris.'});continue;}ad={...old,title:r.title,price,priceText:String(r.price),description:r.equipment?.length?'Utrustning enligt annonsen:\n'+r.equipment.join(' · '):old.description};
          try{const description=originalDescription(await this.request(old.url,{kind:'html',signal}));if(description)ad.description=[description,r.equipment?.length?'Utrustning enligt annonsen: '+r.equipment.join(' · '):''].filter(Boolean).join('\n');}catch(e){if(e.name==='AbortError')throw e;checks.push({source:source.name,status:'partial',error:'Säljarens beskrivning kunde inte läsas: '+e.message});}
        }else if(source.adapter==='riddermark-public'){
          ad=riddermarkDetail(await this.request(old.url,{kind:'html',signal}),old.url);if(!ad)throw new Error('Originalannonsen saknar ett aktivt försäljningspris.');
        }else if(source.webVerified){ad=require('./web-listings.cjs').parseWebListing(await this.request(old.url,{kind:'html',signal}),old.url);if(!ad)throw new Error('Webbannonsen kunde inte verifieras på nytt.');}else ad=parseDetail(source.id,await this.request(old.url,{kind:'html',signal}),old.url);
        if(ad?.excluded||ad&&saleIssue(ad)){this.store.excludeListing(offer.id);checks.push({source:source.name,status:'excluded',error:ad.exclusionReason||saleIssue(ad)});continue;}
        if(ad?.inactive)this.store.removeListing(offer.id);else if(ad)this.store.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...ad,publishedAt:old.publishedDateKnown===false?undefined:old.publishedAt}]});else throw new Error('Originalannonsen saknar verifierbara biluppgifter.');
        checks.push({source:source.name,status:ad.inactive?'removed':'verified'});onProgress({type:'source',source:source.name,status:'done',label:source.name+' · annonsen läst'});
      }catch(e){if(e.name==='AbortError')throw e;if(e.status===404||e.status===410){this.store.removeListing(offer.id);checks.push({source:source.name,status:'removed'});}else checks.push({source:source.name,status:'error',error:e.message});onProgress({type:'source',source:source.name,status:'error',label:source.name+' · annonsen kunde inte verifieras'});}
    }
    return {...this.store.detail(id),checks};
  }
}
module.exports={Market,nextHTMLPage,scopeKey,sourceGroups};

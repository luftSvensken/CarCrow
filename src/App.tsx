import {useCallback,useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import Markdown,{type Components} from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {useVirtualizer} from '@tanstack/react-virtual';
import {ArrowLeft,ArrowUp,ArrowUpRight,Archive,History,Bookmark,CarFront,Check,ChevronDown,ChevronRight,Plus,Settings,SlidersHorizontal,Square,Trash2,X,RefreshCw,Bell,AlertCircle,Search,Sparkles,Sun,Moon,Monitor,Undo2} from 'lucide-react';
import {call,type Bootstrap,type Car,type Filters,type SearchResult,type Chat,type Message,type Activity,type AgentEvent,filterText,relative} from './types';
import {CarCard,Details,Modal,Photo,Empty} from './components';
import {FilterPanel,Compare} from './panels';
import {Crow} from './brand';
export {Crow} from './brand';

type View='chat'|'market'|'saved'|'settings'|'watches'|'recommended'|'archive';
type Results=SearchResult&{comparison?:boolean};
type ChatSummary={id:string;title:string;updated:string};
type ArchivedCar=Car&{removedAt:string;expiresAt:string};
const emptyResults:Results={items:[],total:0,page:0,filters:{sort:'newest'},hasMore:false,remaining:0};
const titles:Record<View,string>={chat:'Ny chatt',market:'Alla bilar',saved:'Sparade',settings:'Inställningar',watches:'Bevakningar',recommended:'Rekommenderade',archive:'Arkiverade'};

export default function App(){
  const [boot,setBoot]=useState<Bootstrap|null>(null),[view,setView]=useState<View>('chat'),[chats,setChats]=useState<ChatSummary[]>([]),[chat,setChat]=useState<Chat|null>(null);
  const [input,setInput]=useState(''),[busy,setBusy]=useState(false),[runId,setRunId]=useState(''),[phase,setPhase]=useState(''),[result,setResult]=useState<Results>(emptyResults),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [detail,setDetail]=useState<Car|null>(null),[selected,setSelected]=useState<Car[]>([]),[filterOpen,setFilterOpen]=useState(false),[compareOpen,setCompareOpen]=useState(false),[watchOpen,setWatchOpen]=useState(false),[showCars,setShowCars]=useState(false);
  const [marketText,setMarketText]=useState(''),[toast,setToast]=useState<{text:string;restore?:string}|null>(null),[archive,setArchive]=useState<ArchivedCar[]>([]),[marketStatus,setMarketStatus]=useState(''),[historyOpen,setHistoryOpen]=useState(false),[crowJump,setCrowJump]=useState(0);
  const current=useRef({chatId:'',busy:false,view,result});current.current={chatId:chat?.id||'',busy,view,result};
  const sending=useRef(false),cancelPending=useRef(false),composer=useRef<HTMLTextAreaElement>(null),chatScroll=useRef<HTMLDivElement>(null),followBottom=useRef(true),loadEpoch=useRef(0),resultFetch=useRef(false),previousView=useRef<View>('chat'),activeRequest=useRef(''),appendResults=useRef(false),viewCache=useRef<Partial<Record<View,Results>>>({});
  const refresh=useCallback(async()=>{try{const [b,c]=await Promise.all([call<Bootstrap>('bootstrap'),call<ChatSummary[]>('chats')]);setBoot(b);setChats(c);}catch(e){setError((e as Error).message);}},[]);
  useEffect(()=>{refresh();const last=localStorage.getItem('lastChat');if(last)openChat(last);return window.carcrow?.onChanged(()=>refresh());},[refresh]);
  useEffect(()=>{if(boot)call('uiReady').catch(()=>{});},[!!boot]);
  useEffect(()=>window.carcrow?.onMarket(e=>{if(e.requestId!==activeRequest.current)return;if(e.type==='results'&&e.result){const partial=e.result;setResult(r=>appendResults.current?mergeResults(r,partial):partial);}else setMarketStatus(e.status==='running'?e.label:'Hämtar aktuella annonser');}),[]);
  useEffect(()=>{if(!boot)return;const dark=boot.theme==='dark'||boot.theme==='system'&&boot.dark;localStorage.setItem('theme',boot.theme);document.documentElement.dataset.theme=dark?'dark':'light';document.documentElement.style.colorScheme=dark?'dark':'light';},[boot?.theme,boot?.dark]);
  useEffect(()=>{if(view!=='archive')return;const update=()=>setArchive(cars=>cars.filter(c=>Date.parse(c.expiresAt)>Date.now()));const timer=setInterval(update,1000);return()=>clearInterval(timer);},[view]);
  useEffect(()=>{if(!toast)return;const timeout=setTimeout(()=>setToast(null),6500);return()=>clearTimeout(timeout);},[toast]);
  useEffect(()=>window.carcrow?.onAgent((e:AgentEvent)=>{
    if(e.chatId!==current.current.chatId)return;
    if(e.runId)setRunId(e.runId);
    if(e.type==='phase'){setPhase(e.label||'Söker efter rätt bil');return;}
    if(e.type==='results'&&e.result){
      if(current.current.view==='chat')setResult(e.result);
      setChat(c=>c?{...c,cars:e.result!.items,filters:e.result!.filters||{},sessionId:e.result!.sessionId,total:e.result!.total,remaining:e.result!.remaining,comparison:e.result!.comparison,hasMore:e.result!.hasMore}:c);return;
    }
    if(['done','error','stopped'].includes(e.type)){setBusy(false);sending.current=false;setRunId('');setPhase('');if(e.chat)setChat(e.chat);refresh();return;}
    if(['text','replaceText','activity','source','references'].includes(e.type))setChat(c=>{
      if(!c)return c;const messages=[...c.messages];let at=messages.findIndex(m=>m.id===e.messageId);
      if(at<0){for(let i=messages.length-1;i>=0;i--)if(messages[i].role==='assistant'&&messages[i].status==='running'){at=i;break;}}if(at<0)return c;
      const m={...messages[at],id:e.messageId};
      if(e.type==='references')m.sources=e.sources;else if(e.type==='text')m.text+=e.delta||'';else if(e.type==='replaceText')m.text=e.text||'';
      else{const a=e.type==='source'?{id:'source:'+e.source,label:e.label||e.source||'',status:e.status||'running'} as Activity:e.activity;if(a){const activities=[...(m.activities||[])];const index=activities.findIndex(x=>x.id===a.id);if(index<0)activities.push(a);else activities[index]=a;m.activities=activities;}}
      messages[at]=m;return {...c,messages};
    });
  }),[refresh]);
  useEffect(()=>{if(followBottom.current)chatScroll.current?.scrollTo({top:chatScroll.current.scrollHeight,behavior:'instant'});},[chat?.messages,phase]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();navigate('chat');composer.current?.focus();}if((e.metaKey||e.ctrlKey)&&e.key===','){e.preventDefault();navigate('settings');}};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(()=>{if(composer.current){composer.current.style.height='auto';composer.current.style.height=Math.min(168,composer.current.scrollHeight)+'px';}},[input,view,chat?.id]);

  async function send(text=input){
    if(sending.current||busy||!text.trim())return;sending.current=true;cancelPending.current=false;setBusy(true);setError('');setView('chat');setShowCars(false);setInput('');setPhase('Förstår dina önskemål');followBottom.current=true;
    const next=chat||{id:crypto.randomUUID(),title:text.trim().slice(0,60),messages:[],cars:[],filters:{},hasMore:false};
    localStorage.setItem('lastChat',next.id);current.current.chatId=next.id;
    setChat({...next,messages:[...next.messages,{id:crypto.randomUUID(),role:'user',text:text.trim()},{id:'pending:'+crypto.randomUUID(),role:'assistant',text:'',status:'running',startedAt:new Date().toISOString(),activities:[]}]});
    try{const started=await call<{chatId:string;runId:string}>('agentStart',{chatId:next.id,text,filters:result.filters||next.filters,ids:selected.map(c=>c.id)});setRunId(started.runId);if(cancelPending.current)await call('agentStop',{runId:started.runId});}
    catch(e){sending.current=false;setBusy(false);setPhase('');setChat(c=>c?{...c,messages:c.messages.map(m=>m.status==='running'?{...m,status:'error',error:(e as Error).message}:m)}:c);}
  }
  async function stop(){cancelPending.current=true;if(runId)await call('agentStop',{runId});setPhase('Avbryter');}
  function cancelLoad(){if(activeRequest.current)call('marketCancel',{requestId:activeRequest.current}).catch(()=>{});activeRequest.current='';++loadEpoch.current;setLoading(false);}
  function newChat(){if(busy)return;cancelLoad();localStorage.removeItem('lastChat');++loadEpoch.current;setChat(null);setResult(emptyResults);setSelected([]);setView('chat');setInput('');setShowCars(false);setError('');followBottom.current=true;requestAnimationFrame(()=>composer.current?.focus());}
  async function openChat(id:string){if(busy)return;cancelLoad();try{const c=await call<Chat>('chat',{id});if(!c)return;localStorage.setItem('lastChat',id);++loadEpoch.current;setChat(c);setView('chat');setResult(chatResults(c));setShowCars(false);followBottom.current=true;}catch(e){setError((e as Error).message);}}
  async function openCar(id:string){try{setDetail(await call<Car>('detail',{id}));}catch(e){setError((e as Error).message);}}
  function updateSaved(id:string,saved:boolean){
    setResult(r=>({...r,items:current.current.view==='saved'&&!saved?r.items.filter(c=>c.id!==id):r.items.map(c=>c.id===id?{...c,saved}:c)}));
    setChat(c=>c?{...c,cars:c.cars.map(car=>car.id===id?{...car,saved}:car)}:c);
    setDetail(c=>c?.id===id?{...c,saved}:c);setSelected(s=>s.map(c=>c.id===id?{...c,saved}:c));
  }
  async function bookmark(id:string){try{const saved=await call<boolean>('bookmark',{id});updateSaved(id,saved);setToast({text:saved?'Bilen är sparad':'Bilen är arkiverad i 24 timmar',restore:saved?undefined:id});}catch(e){setError((e as Error).message);}}
  async function restore(id:string){try{await call('restoreBookmark',{id});updateSaved(id,true);setArchive(a=>a.filter(c=>c.id!==id));setToast({text:'Bilen är tillbaka i Sparade'});if(view==='saved')loadBase(result.filters||{},true);refresh();}catch(e){setError((e as Error).message);}}
  const toggleSelect=(car:Car)=>{if(!selected.some(c=>c.id===car.id))call('compareSignal',{id:car.id}).catch(()=>{});setSelected(s=>s.some(c=>c.id===car.id)?s.filter(c=>c.id!==car.id):s.length<4?[...s,car]:s);};
  async function loadBase(f:Filters,saved=false,track=true,target=current.current.view){
    cancelLoad();const requestId=crypto.randomUUID();activeRequest.current=requestId;appendResults.current=false;
    const epoch=++loadEpoch.current;setLoading(true);setError('');setMarketStatus('Hämtar aktuella annonser');const cached=viewCache.current[target];setResult(cached&&JSON.stringify(cached.filters)===JSON.stringify(f)?cached:{...emptyResults,filters:f});
    try{const r=await call<Results>(saved?'searchNext':'marketStart',{filters:f,saved,requestId,track});if(epoch!==loadEpoch.current)return;setResult(r);viewCache.current[target]=r;}
    catch(e){if(epoch===loadEpoch.current)setError((e as Error).message);}finally{if(epoch===loadEpoch.current)setLoading(false);}
  }
  async function navigate(next:View){
    if(next!==view)previousView.current=view;cancelLoad();setError('');setView(next);setSelected([]);
    if(next==='chat'){setResult(chat?chatResults(chat):emptyResults);return;}
    if(next==='market'||next==='saved'){if(next==='market')setMarketText('');await loadBase({sort:'newest'},next==='saved',false,next);}
    if(next==='archive'){try{setArchive(await call<ArchivedCar[]>('archive'));}catch(e){setError((e as Error).message);}}
    if(next==='recommended'){const epoch=loadEpoch.current,requestId=crypto.randomUUID();activeRequest.current=requestId;appendResults.current=false;setResult(viewCache.current.recommended||emptyResults);setLoading(true);try{const r=await call<Results>('recommendations',{requestId});if(epoch===loadEpoch.current){setResult(r);viewCache.current.recommended=r;}}catch(e){if(epoch===loadEpoch.current)setError((e as Error).message);}finally{if(epoch===loadEpoch.current)setLoading(false);}}
  }
  function back(){navigate(view==='archive'?'settings':previousView.current==='settings'||previousView.current===view?'chat':previousView.current);}
  async function more(){
    if(resultFetch.current||loading||busy)return;resultFetch.current=true;setLoading(true);const snapshot=current.current.result,epoch=loadEpoch.current,requestId=crypto.randomUUID();activeRequest.current=requestId;appendResults.current=true;
    try{
      const next=await call<Results>(view==='saved'?'searchNext':'marketPage',{filters:snapshot.filters||{},saved:view==='saved',sessionId:snapshot.sessionId,excludeIds:snapshot.items.map(c=>c.id),requestId});
      if(epoch!==loadEpoch.current)return;
      setResult(r=>{const items=new Map(r.items.map(c=>[c.id,c]));for(const c of next.items)items.set(c.id,c);const updated={...next,items:[...items.values()]};if(current.current.view==='chat')setChat(c=>c?{...c,cars:updated.items,total:updated.total,remaining:updated.remaining,hasMore:updated.hasMore,sessionId:updated.sessionId}:c);return updated;});
    }catch(e){if(epoch===loadEpoch.current)setError((e as Error).message);}finally{resultFetch.current=false;if(epoch===loadEpoch.current)setLoading(false);}
  }
  const composerUI=<form className={'composer '+(busy?'working':'')} onSubmit={(e:FormEvent)=>{e.preventDefault();send();}}><textarea ref={composer} aria-label="Meddelande till CarCrow" rows={1} value={input} onChange={e=>setInput(e.target.value)} placeholder={chat?'Fortsätt sökningen…':'Beskriv bilen du vill hitta…'} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();send();}}}/>{busy?<button type="button" className="send" aria-label="Stoppa sökningen" onClick={stop}><Square size={16} fill="currentColor"/></button>:<button className="send" aria-label="Skicka meddelande" disabled={!input.trim()}><ArrowUp size={21}/></button>}</form>;
  if(!boot)return <div className="startup"><Crow size={48} thinking/><h1>CarCrow</h1>{error?<><p>{error}</p><button className="button secondary" onClick={refresh}>Försök igen</button></>:<p>Gör plats för nästa bil.</p>}</div>;
  const hasResults=!!result.items.length;
  const selectionBar=!!selected.length&&<div className="selection-bar"><strong>{selected.length} valda</strong><button onClick={async()=>{try{setSelected(await Promise.all(selected.map(c=>call<Car>('detail',{id:c.id}))));setCompareOpen(true);}catch(e){setError((e as Error).message);}}}>Jämför<ArrowUpRight size={16}/></button><button className="icon-button" aria-label="Rensa valda bilar" onClick={()=>setSelected([])}><X size={16}/></button></div>;
  const resultsPanel=<section className={'results-panel '+(view==='chat'?'chat-results':'')} aria-label="Sökresultat">
    <header className="results-header"><div><h2>{view==='saved'?'Dina sparade bilar':view==='recommended'?'Utvalt för dig':view==='market'?'Hitta din nästa bil':'Bilar som matchar'}</h2>{view==='market'&&<p>Sök bland aktuella annonser från flera källor.</p>}</div><div className="result-actions">
      {view!=='recommended'&&<><button className="button secondary compact" aria-label="Filter" onClick={()=>setFilterOpen(true)}><SlidersHorizontal size={16}/>Filter</button><select aria-label="Sortera annonser" value={result.filters?.sort||'newest'} onChange={e=>loadBase({...result.filters,sort:e.target.value},view==='saved')}><option value="newest">Senaste</option><option value="priceAsc">Lägst pris</option><option value="priceDesc">Högst pris</option><option value="mileage">Lägst miltal</option><option value="deals">Fynd</option></select></>}
      {view!=='saved'&&view!=='recommended'&&<button className="icon-button" aria-label="Bevaka sökning" title="Bevaka sökning" onClick={()=>setWatchOpen(true)}><Bell size={18}/></button>}
      {view==='market'&&<button className="icon-button" aria-label="Uppdatera sökning" title="Uppdatera sökning" disabled={loading} onClick={()=>loadBase(result.filters||{})}><RefreshCw size={17}/></button>}
    </div></header>
    {view==='market'&&<MarketSearch boot={boot} filters={result.filters||{}} text={marketText} setText={setMarketText} loading={loading} search={f=>loadBase(f)}/>}
    {view==='recommended'&&<p className="view-description">Utifrån dina senaste chattar, sökningar, sparade bilar och bilar du utforskar. Urvalet räknas på din dator.</p>}
    {view==='chat'&&filterText(result.filters||{})!=='Alla bilar'&&<button className="criteria" onClick={()=>setFilterOpen(true)}>{filterText(result.filters||{})}<ChevronDown size={15}/></button>}
    <CarGrid items={result.items} loading={loading} loadingLabel={marketStatus} more={more} canLoad={!error&&!busy&&(!!result.hasMore||(result.remaining||0)>0)} selected={selected} open={openCar} save={bookmark} select={toggleSelect} savedView={view==='saved'}/>
    {(error||result.sourceWarning)&&<div className="results-error" role="alert"><AlertCircle size={17}/><span>{error||result.sourceWarning}</span><button onClick={()=>loadBase(result.filters||{},view==='saved')}>Försök igen</button></div>}
    {selectionBar}
  </section>;
  return <div className={'app-shell platform-'+boot.platform}>
    <aside className="sidebar"><div className="window-drag"/><button className="brand" aria-label="CarCrow" onClick={newChat}><Crow size={31}/><strong>CarCrow</strong></button><button className="new-chat" aria-label="Ny chatt" onClick={newChat} disabled={busy}><Plus size={18}/><span>Ny chatt</span></button>
      <nav aria-label="Huvudnavigation">{([{id:'market',label:'Alla bilar',icon:CarFront},{id:'recommended',label:'Rekommenderade',icon:Sparkles},{id:'saved',label:'Sparade',icon:Bookmark},{id:'watches',label:'Bevakningar',icon:Bell}] as const).map(({id,label,icon:Icon})=><button key={id} aria-label={label} title={label} className={view===id?'active':''} onClick={()=>navigate(id)}><Icon size={18}/><span>{label}</span>{id==='watches'&&boot.watches.some(w=>w.newCount>0)&&<i className="nav-dot"/>}</button>)}</nav>
      <button className="history-mobile icon-button" aria-label="Visa chatthistorik" title="Dina chattar" onClick={()=>setHistoryOpen(true)}><History size={19}/></button><div className="chat-history"><div className="history-heading">Dina chattar</div>{chats.map(c=><div className={'history-item '+(view==='chat'&&chat?.id===c.id?'active':'')} key={c.id}><button onClick={()=>openChat(c.id)} disabled={busy} title={c.title}>{c.title}</button><button className="delete-chat" disabled={busy} aria-label={'Ta bort chatten '+c.title} onClick={async()=>{try{await call('chatDelete',{id:c.id});if(chat?.id===c.id)newChat();refresh();}catch(e){setError((e as Error).message);}}}><Trash2 size={13}/></button></div>)}{!chats.length&&<p className="history-empty">Dina sökningar samlas här.</p>}</div>
      <button className={'settings-nav '+(view==='settings'||view==='archive'?'active':'')} aria-label="Inställningar" title="Inställningar" onClick={()=>navigate('settings')}><Settings size={18}/><span>Inställningar</span></button>
    </aside>
    <main className="workspace"><header className="window-bar">{['settings','archive','watches'].includes(view)&&<button className="icon-button back-button" aria-label="Tillbaka" onClick={back}><ArrowLeft size={18}/></button>}<span>{view==='chat'?(chat?.title||'Ny chatt'):titles[view]}</span>{view==='chat'&&hasResults&&<div className="mobile-switch"><button className={!showCars?'active':''} onClick={()=>setShowCars(false)}>Samtal</button><button className={showCars?'active':''} onClick={()=>setShowCars(true)}>Bilar</button></div>}</header>
      {view==='chat'?<div className={'chat-workspace view-enter '+(hasResults?'with-results':'')+' '+(showCars?'cars-visible':'chat-visible')}><section className="chat-panel"><div className={'chat-scroll '+(!chat?.messages.length?'empty-chat':'')} ref={chatScroll} onScroll={()=>{const el=chatScroll.current;if(el)followBottom.current=el.scrollHeight-el.scrollTop-el.clientHeight<100;}}>
        {!chat?.messages.length?<div className="welcome"><button className="crow-easter-egg" aria-label="Väck kråkan" onClick={()=>setCrowJump(n=>n+1)} onAnimationEnd={e=>{if(e.animationName==='crow-hop')setCrowJump(0);}}><Crow key={crowJump} size={52} jumping={crowJump>0}/></button><h1>Vilken bil spanar du efter?</h1>{composerUI}<div className="starters">{['BMW eller Audi under 150 000 kr','En bra familjebil','Hitta intressanta fynd'].map(text=><button key={text} onClick={()=>send(text)}>{text}<ArrowUpRight size={14}/></button>)}</div></div>:<div className="messages" role="log" aria-label="Chatt med CarCrow">{chat.messages.map(m=><ChatMessage key={m.id} chatId={chat.id} message={m} phase={phase} retry={()=>{const user=[...chat.messages].reverse().find(x=>x.role==='user');if(user)send(user.text);}}/>)}</div>}
      </div>{!!chat?.messages.length&&<div className="composer-dock">{composerUI}<span className="composer-hint">Kontrollera alltid uppgifterna i originalannonsen.</span></div>}</section>{hasResults&&resultsPanel}</div>
      :['market','saved','recommended'].includes(view)?<div className="market-workspace view-enter" key={view}>{resultsPanel}</div>
      :view==='settings'?<SettingsView boot={boot} failure={error} refresh={refresh} error={setError} archive={()=>navigate('archive')}/>
      :view==='watches'?<><WatchesView boot={boot} refresh={refresh} error={setError} openCar={openCar} save={bookmark} select={toggleSelect} selected={selected} open={f=>{setView('market');setMarketText(f.query||'');loadBase(f);}}/>{selectionBar}</>
      :<div className="settings-content view-enter"><h1>Arkiverade bilar</h1><p className="view-description">Bilar du tar bort från Sparade kan återställas här i 24 timmar.</p>{archive.length?<div className="archive-list">{archive.map(car=><div className="archive-row" key={car.id}><button className="archive-photo" aria-label={'Visa '+car.title} onClick={()=>openCar(car.id)}><Photo car={car}/></button><div><strong>{car.make} {car.model}</strong><span>{car.year} · {car.variant}</span><small>Försvinner om {Math.max(1,Math.ceil((Date.parse(car.expiresAt)-Date.now())/3600000))} timmar</small></div><button className="button secondary" onClick={()=>restore(car.id)}><Undo2 size={16}/>Återställ</button></div>)}</div>:<Empty icon={<Archive size={30}/>} title="Inga arkiverade bilar" text="Bilar du tar bort från Sparade hamnar här tillfälligt."/>}</div>}
    </main>
    {filterOpen&&<FilterPanel boot={boot} filters={result.filters||{}} close={()=>setFilterOpen(false)} apply={f=>{setFilterOpen(false);loadBase(f,view==='saved');}}/>}
    {detail&&<Details car={detail} close={()=>setDetail(null)} save={()=>bookmark(detail.id)} openOffer={async offerId=>{try{await call('openOffer',{id:detail.id,offerId});}catch(e){setError((e as Error).message);}}} openPeer={openCar}/>}
    {compareOpen&&<Compare cars={selected} close={()=>setCompareOpen(false)} open={id=>{setCompareOpen(false);openCar(id);}}/>}
    {watchOpen&&<WatchDialog filters={result.filters||{}} close={()=>setWatchOpen(false)} saved={()=>{setWatchOpen(false);setToast({text:'Bevakningen söker efter matchande bilar'});refresh();}}/>}
    {historyOpen&&<Modal title="Dina chattar" close={()=>setHistoryOpen(false)}><div className="history-dialog">{chats.length?chats.map(c=><button key={c.id} onClick={()=>{setHistoryOpen(false);openChat(c.id);}}><span>{c.title}</span><ChevronRight size={16}/></button>):<p>Dina sökningar samlas här.</p>}</div></Modal>}
    {toast&&<div className="toast" role="status"><Check size={17}/><span>{toast.text}</span>{toast.restore&&<button onClick={()=>restore(toast.restore!)}>Ångra</button>}<button className="icon-button" aria-label="Stäng meddelande" onClick={()=>setToast(null)}><X size={15}/></button></div>}
  </div>;
}

function mergeResults(previous:Results,next:Results):Results{const items=new Map(previous.items.map(c=>[c.id,c]));for(const c of next.items)items.set(c.id,c);return {...next,items:[...items.values()]};}
function chatResults(c:Chat):Results{return {items:c.cars,total:c.total??c.cars.length,page:0,filters:c.filters,remaining:c.remaining??0,hasMore:c.hasMore,sessionId:c.sessionId,comparison:c.comparison};}
function AnimatedWords({children}:{children:ReactNode}){return <>{Array.isArray(children)?children.map((child,i)=>typeof child==='string'?child.split(/(\s+)/).map((word,j)=><span className={word.trim()?'stream-word':''} key={i+':'+j}>{word}</span>):child):typeof children==='string'?children.split(/(\s+)/).map((word,i)=><span className={word.trim()?'stream-word':''} key={i}>{word}</span>):children}</>;}
const markdownComponents:Components={p:({children})=><p><AnimatedWords>{children}</AnimatedWords></p>,li:({children})=><li><AnimatedWords>{children}</AnimatedWords></li>,a:({children})=><span className="chat-reference">{children}</span>,table:({children})=><div className="markdown-table"><table>{children}</table></div>};
function ChatMessage({message,phase,retry,chatId}:{chatId:string;message:Message;phase:string;retry:()=>void}){
  const working=message.status==='running',activities=message.activities||[];
  const trail=activities.filter(a=>!/^CarCrow (planerar|läser)/.test(a.label));
  const status=working?(trail.filter(a=>a.status==='running').at(-1)?.label||(message.text?'Formulerar svaret':phase||'Förstår dina önskemål')):message.status==='stopped'?'Sökningen avbröts':message.status==='error'?'Sökningen kunde inte slutföras':'Så hittade vi bilarna';
  return <article className={'message '+message.role}>
    {message.role==='assistant'&&<div className="assistant-avatar"><Crow size={25} thinking={working}/></div>}
    <div className="message-body">
      {message.role==='assistant'&&(trail.length>0||working)&&<details className="activity-trail"><summary><span className="activity-summary">{status}</span><span className="activity-open-label">Söksteg</span>{trail.length>0&&<ChevronDown size={14}/>}</summary>{trail.length>0&&<ol>{trail.map(a=><li key={a.id}><span className={'activity-dot '+a.status}/><span>{a.label}</span></li>)}</ol>}</details>}
      {message.text&&<div className={'message-text '+(working?'streaming':'')}><Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={markdownComponents}>{message.text.replace(/\b(search_market|search_database|inspect_car|compare_cars)\b/g,name=>({search_market:'marknadssökning',search_database:'annonsökning',inspect_car:'annonsgranskning',compare_cars:'prisjämförelse'} as Record<string,string>)[name])}</Markdown></div>}
      {!!message.sources?.length&&<div className="web-references" aria-label="Webbkällor">{message.sources.map(source=><button key={source.id} title={source.title} onClick={()=>call('openWebSource',{chatId,messageId:message.id,sourceId:source.id}).catch(()=>{})}><span>{source.number}</span>{source.domain}<ArrowUpRight size={12}/></button>)}</div>}
      {message.error&&message.status!=='stopped'&&<div className="message-error"><p>{message.error}</p><button onClick={retry}>Försök igen<RefreshCw size={14}/></button></div>}
    </div>
  </article>;
}
function MarketSearch({boot,filters,text,setText,loading,search}:{boot:Bootstrap;filters:Filters;text:string;setText:(s:string)=>void;loading:boolean;search:(f:Filters)=>void}){
  const [draft,setDraft]=useState(filters);useEffect(()=>setDraft(filters),[filters]);
  const brands=[...new Set([...boot.facets.makes,'Audi','BMW','Citroën','Dacia','Fiat','Ford','Honda','Hyundai','Kia','Mazda','Mercedes-Benz','MINI','Nissan','Opel','Peugeot','Polestar','Renault','SEAT','Skoda','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'])].sort((a,b)=>a.localeCompare(b,'sv'));
  const models=boot.facets.models.filter(m=>draft.makes?.includes(m.make));
  return <form className="market-search" onSubmit={e=>{e.preventDefault();search({...draft,query:text.trim()||undefined});}}>
    <div className="market-search-top"><label className="text-search"><Search size={19}/><input aria-label="Sök bilar" value={text} onChange={e=>setText(e.target.value)} placeholder="Sök märke, modell eller utrustning"/>{text&&<button type="button" className="icon-button" aria-label="Rensa söktext" onClick={()=>setText('')}><X size={15}/></button>}</label><button className="button primary" type="submit" aria-busy={loading}><Search size={17}/>Sök bilar</button></div>
    <div className="quick-filters"><label>Märke<select aria-label="Märke" value={draft.makes?.[0]||''} onChange={e=>setDraft({...draft,makes:e.target.value?[e.target.value]:undefined,models:undefined})}><option value="">Alla märken</option>{brands.map(m=><option key={m}>{m}</option>)}</select></label><label>Modell<input aria-label="Modell" list="market-models" disabled={!draft.makes?.length} value={draft.models?.[0]||''} placeholder="Alla modeller" onChange={e=>setDraft({...draft,models:e.target.value?[e.target.value]:undefined})}/><datalist id="market-models">{models.map(m=><option key={m.make+m.model} value={m.model}/>)}</datalist></label><label>Högsta pris<input aria-label="Högsta pris" inputMode="numeric" type="number" min="0" step="1000" placeholder="Ingen gräns" value={draft.maxPrice??''} onChange={e=>setDraft({...draft,maxPrice:e.target.value?Number(e.target.value):undefined})}/></label><label>Växellåda<select aria-label="Växellåda" value={draft.gearbox||''} onChange={e=>setDraft({...draft,gearbox:e.target.value||undefined})}><option value="">Alla</option><option>Automat</option><option>Manuell</option></select></label></div>
    {filterText(filters)!=='Alla bilar'&&<div className="applied-filters"><span>{filterText(filters)}</span><button type="button" onClick={()=>{setText('');setDraft({sort:filters.sort});search({sort:filters.sort});}}>Rensa filter<X size={14}/></button></div>}
  </form>;
}
function CarGrid({items,loading,loadingLabel,more,canLoad,selected,open,save,select,savedView}:{items:Car[];loading:boolean;loadingLabel:string;more:()=>void;canLoad:boolean;selected:Car[];open:(id:string)=>void;save:(id:string)=>void;select:(car:Car)=>void;savedView:boolean}){
  const scroll=useRef<HTMLDivElement>(null),[columns,setColumns]=useState(2);
  useEffect(()=>{const el=scroll.current;if(!el)return;const observer=new ResizeObserver(entries=>setColumns(entries[0].contentRect.width>1080?3:entries[0].contentRect.width<540?1:2));observer.observe(el);return()=>observer.disconnect();},[]);
  const rowCount=Math.ceil(items.length/columns),virtual=useVirtualizer({count:rowCount+1,getScrollElement:()=>scroll.current,estimateSize:i=>i===rowCount?90:365,overscan:2}),rows=virtual.getVirtualItems();
  useEffect(()=>{const last=rows.at(-1);if(items.length&&last&&last.index>=rowCount-1&&canLoad&&!loading)more();},[rows.at(-1)?.index,rowCount,canLoad,loading]);
  return <div className="results-scroll" ref={scroll}>
    {!items.length&&loading?<div className="skeleton-grid">{Array.from({length:6},(_,i)=><div className="skeleton-card" key={i}><div/><i/><i/><i/></div>)}<div className="market-loading" role="status"><Crow thinking size={24}/><span>{loadingLabel||'Hämtar aktuella annonser'}</span></div></div>
    :!items.length?<><Empty icon={savedView?<Bookmark size={30}/>:<CarFront size={30}/>} title={savedView?'Din kortlista börjar här':'Inga bilar matchar ännu'} text={savedView?'Spara bilar du gillar med bokmärket på bilkortet.':'Prova ett annat märke eller lite bredare filter.'}/>{canLoad&&<div className="load-more"><button onClick={more}>Sök vidare hos källorna<ChevronDown size={16}/></button></div>}</>
    :<div className="virtual-grid" style={{height:virtual.getTotalSize()}}>{rows.map(row=><div className={'virtual-row '+(row.index===rowCount?'loader-row':'')} data-index={row.index} key={row.key} ref={virtual.measureElement} style={{transform:`translateY(${row.start}px)`,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`}}>{row.index===rowCount?<div className="load-more">{loading?<><Crow size={22} thinking/><span>Hämtar fler bilar…</span></>:canLoad?<button onClick={more}>Visa fler bilar<ChevronDown size={16}/></button>:<span>Du har sett de tillgängliga annonserna för den här sökningen.</span>}</div>:items.slice(row.index*columns,(row.index+1)*columns).map(car=><CarCard key={car.id} car={car} open={()=>open(car.id)} save={()=>save(car.id)} select={()=>select(car)} selected={selected.some(c=>c.id===car.id)}/>)}</div>)}</div>}
  </div>;
}
function WatchDialog({filters,close,saved}:{filters:Filters;close:()=>void;saved:()=>void}){
  const [name,setName]=useState(filterText(filters)),[busy,setBusy]=useState(false),[error,setError]=useState('');
  return <Modal title="Bevaka sökning" close={close}><form className="form-content" onSubmit={async e=>{e.preventDefault();setBusy(true);try{await call('watch',{name,filters});saved();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}><p className="muted small">Vi söker efter nya annonser varje gång du öppnar CarCrow. Du hittar dem under Bevakningar.</p><label>Namn<input value={name} onChange={e=>setName(e.target.value)} required maxLength={100}/></label><div className="watch-criteria">{filterText(filters)}</div>{error&&<p role="alert" className="message-error">{error}</p>}<button className="button primary" disabled={busy}>Spara bevakning<Bell size={17}/></button></form></Modal>;
}
function WatchesView({boot,refresh,error,open,openCar,save,select,selected}:{boot:Bootstrap;refresh:()=>Promise<void>;error:(s:string)=>void;open:(f:Filters)=>void;openCar:(id:string)=>void;save:(id:string)=>void;select:(car:Car)=>void;selected:Car[]}){
  const [checking,setChecking]=useState(false);
  return <div className="settings-content watches-content view-enter"><div className="page-heading"><div><h1>Bevakningar</h1><p>Nya bilar som matchar dina sparade sökningar.</p></div><button className="button secondary" disabled={checking||boot.checkingWatches} onClick={async()=>{setChecking(true);try{await call('checkWatches');await refresh();}catch(e){error((e as Error).message);}finally{setChecking(false);}}}><RefreshCw size={16}/>Kontrollera nu</button></div>
    {(checking||boot.checkingWatches)&&<div className="watch-checking" role="status"><Crow size={24} thinking/>Kontrollerar dina bevakningar…</div>}
    {boot.watches.map(w=><section className="watch-group" key={w.id}><article className="watch-card"><div className="watch-icon"><Bell size={21}/></div><div className="watch-body"><h2>{w.name}</h2><p>{filterText(w.filters)}</p><span>{w.checkedAt?'Kontrollerad '+relative(w.checkedAt):'Kontrolleras vid nästa start'}</span>{w.error&&<small className="message-error">Någon källa kunde inte uppdateras. Försök igen.</small>}</div>{w.newCount>0&&<span className="new-badge">{w.newCount} nya</span>}<button className="button secondary" onClick={async()=>{await call('markWatch',{id:w.id});open(w.filters);refresh();}}>Visa bilar<ChevronRight size={15}/></button><button className="icon-button" aria-label={'Ta bort bevakningen '+w.name} onClick={async()=>{await call('unwatch',{id:w.id});refresh();}}><Trash2 size={17}/></button></article>{w.items?.length>0&&<div className="watch-picks" aria-label={'Utvalt för '+w.name}>{w.items.slice(0,3).map(car=><CarCard key={car.id} car={car} open={()=>openCar(car.id)} save={()=>save(car.id)} select={()=>select(car)} selected={selected.some(c=>c.id===car.id)}/>)}</div>}</section>)}
    {!boot.watches.length&&<Empty icon={<Bell size={30}/>} title="Låt nästa bil hitta dig" text="Gör en sökning och tryck på klockan för att bevaka den."/>}
    <div className="watch-explanation"><h3>Så fungerar det</h3><p>När du öppnar appen söker vi på nytt med dina filter. Annonser du inte sett markeras som nya. Du kan även kontrollera manuellt här. Den lokala modellen jämför bilar som klarar dina filter med bevakningen och dina önskemål. Utvalda bilar visas här. Appen behöver inte vara öppen i bakgrunden.</p></div>
  </div>;
}
function SettingsView({boot,refresh,error,archive,failure}:{boot:Bootstrap;failure:string;refresh:()=>Promise<void>;error:(message:string)=>void;archive:()=>void}){
  const update=boot.updates;const updating=['downloading','installing'].includes(update.status);
  return <div className="settings-content view-enter"><h1>Inställningar</h1>{failure&&<p role="alert" className="message-error">{failure}</p>}
    <section><h2>Utseende</h2><p className="section-description">Välj det som känns bäst på din skärm.</p><div className="theme-picker">{([{id:'light',label:'Ljust',icon:Sun},{id:'dark',label:'Mörkt',icon:Moon},{id:'system',label:'System',icon:Monitor}] as const).map(({id,label,icon:Icon})=><button key={id} className={boot.theme===id?'active':''} aria-pressed={boot.theme===id} onClick={async()=>{try{await call('settings',{theme:id});refresh();}catch(e){error((e as Error).message);}}}><Icon size={20}/><span>{label}</span>{boot.theme===id&&<Check size={15}/>}</button>)}</div></section>
    <section><h2>Sparade bilar</h2><button className="setting-row archive-link" onClick={archive}><Archive size={20}/><div><strong>Arkiverade</strong><span>Återställ borttagna favoriter i upp till 24 timmar</span></div><ChevronRight size={18}/></button></section>
    <section><h2>Datakällor</h2><p className="section-description">Aktuella annonser hämtas när du söker och skrollar.</p>{boot.sources.filter(s=>!!s.adapter).map(s=><div className="setting-row" key={s.id}><div><strong>{s.name}</strong><span>{s.error?'Tillfälligt otillgänglig':!s.enabled?'Avstängd':s.lastSync?'Kontrollerad '+relative(s.lastSync):'Redo för sökning'}</span></div><button className={'toggle '+(s.enabled?'on':'')} role="switch" aria-checked={s.enabled} aria-label={'Aktivera '+s.name} onClick={async()=>{try{await call('saveSource',{...s,enabled:!s.enabled});refresh();}catch(e){error((e as Error).message);}}}><i/></button></div>)}</section>
    <section className="update-settings"><h2>Uppdateringar</h2><p className="section-description">CarCrow {boot.version}. Nya versioner hämtas från vårt GitHub-projekt. Dina chattar, sparade bilar och bevakningar följer med.</p><div className="update-actions"><button className="button secondary" disabled={updating||update.status==='checking'} onClick={async()=>{try{await call('updateCheck');await refresh();}catch(e){error((e as Error).message);}}}><RefreshCw size={16}/>{update.status==='checking'?'Kontrollerar…':'Sök efter uppdatering'}</button>{update.latest&&<button className="button primary" disabled={updating} onClick={async()=>{try{await call('updateInstall');}catch(e){error((e as Error).message);refresh();}}}>{updating?update.status==='installing'?'Installerar…':`Hämtar ${update.progress} %`:`Installera ${update.latest}`}</button>}{update.status==='downloading'&&<button className="button secondary" onClick={()=>call('updateCancel')}>Avbryt</button>}</div>{update.status==='current'&&<p className="small muted" role="status">Du har den senaste tillgängliga versionen.</p>}{updating&&<progress max={100} value={update.progress} aria-label="Uppdateringshämtning"/>}{update.error&&<p role="alert" className="message-error">{update.error}</p>}<p className="small muted">Appen startar om efter installationen.</p></section>
    <section><h2>Om CarCrow</h2><p className="section-description">Dina favoriter, chattar och bevakningar sparas på datorn. AI-sökningen använder verkliga annonser. Kontrollera alltid bilen och villkoren hos säljaren.</p></section>
  </div>;
}

export function Crow({size=28,thinking=false,jumping=false}:{size?:number;thinking?:boolean;jumping?:boolean}){
  return <svg className={'crow '+(thinking?'crow-thinking':'')+(jumping?' crow-jumping':'')} width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M7 22c-2-4-1-10 3-14 3-3 8-3 11 0l6 2-5 4c0 7-5 12-12 11l-6 3 3-6Z" fill="currentColor"/>
    <path className="crow-wing" d="m10 15 8 2-8 5" stroke="var(--crow-wing)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="19" cy="9.6" r="1.1" fill="var(--crow-wing)"/>
  </svg>;
}

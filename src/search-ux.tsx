import {X} from 'lucide-react';
import {type Car,type Filters,money,number} from './types';

type Constraint={id:string;label:string;remove:()=>Filters};
export function constraints(filters:Filters):Constraint[]{
 const entries:Constraint[]=[];
 const add=(key:keyof Filters,label:string)=>entries.push({id:key,label,remove:()=>{const next={...filters};delete next[key];if(key==='location'&&next.sort==='distance')next.sort='relevance';return next;}});
 const many=(key:'makes'|'models'|'bodyTypes'|'fuelTypes'|'sources'|'cities',format=(v:string)=>v)=>{for(const value of filters[key]||[])entries.push({id:key+':'+value,label:format(value),remove:()=>({...filters,[key]:filters[key]!.length>1?filters[key]!.filter(v=>v!==value):undefined})});};
 many('makes');many('models');
 if(filters.query)add('query','”'+filters.query+'”');
 if(filters.maxPrice!=null)add('maxPrice','Max '+money(filters.maxPrice));
 if(filters.minPrice!=null&&filters.minPrice>0)add('minPrice','Min '+money(filters.minPrice));
 if(filters.gearbox)add('gearbox',filters.gearbox);
 if(filters.minYear)add('minYear','Från '+filters.minYear);
 if(filters.maxYear)add('maxYear','Till '+filters.maxYear);
 if(filters.maxMileage!=null)add('maxMileage','Max '+number(filters.maxMileage)+' mil');
 if(filters.minMileage)add('minMileage','Min '+number(filters.minMileage)+' mil');
 many('fuelTypes');many('bodyTypes');many('cities');
 if(filters.location)add('location',filters.location.label+(filters.location.radiusKm?' · '+filters.location.radiusKm+' km':''));
 if(filters.sellerType)add('sellerType',filters.sellerType==='dealer'?'Bilhandlare':'Privatperson');
 if(filters.hasImages)add('hasImages','Med bilder');
 if(filters.publishedWithinDays)add('publishedWithinDays','Senaste '+filters.publishedWithinDays+' dagar');
 const sourceNames:Record<string,string>={blocket:'Blocket',bytbil:'Bytbil',wayke:'Wayke',kvd:'Kvd',riddermark:'Riddermark'};many('sources',s=>sourceNames[s]||s);
 return entries;
}
export function ConstraintChips({filters,change,disabled=false}:{filters:Filters;change:(filters:Filters)=>void;disabled?:boolean}){
 const entries=constraints(filters);if(!entries.length)return null;
 return <div className="constraint-chips" aria-label="Aktiva sökfilter">{entries.map(c=><button key={c.id} type="button" disabled={disabled} title={'Ta bort '+c.label} aria-label={'Ta bort filtret '+c.label} onClick={()=>change(c.remove())}>{c.label}<X size={12}/></button>)}</div>;
}
export function sortedShortlist(cars:Car[],sort:string):Car[]{
 const value=(c:Car)=>sort==='priceAsc'||sort==='priceDesc'?c.price:sort==='mileage'?c.mileage:sort==='yearDesc'?c.year:sort==='distance'?c.distanceKm:sort==='deals'?c.comparison?.percentBelow:sort==='newest'?Date.parse(c.publishedAt):null;
 if(sort==='relevance')return cars;
 return [...cars].sort((a,b)=>{const av=value(a),bv=value(b);if(av==null)return bv==null?0:1;if(bv==null)return -1;return ['priceDesc','yearDesc','deals','newest'].includes(sort)?bv-av:av-bv;});
}

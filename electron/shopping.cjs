const {normalize}=require('./search-query.cjs');
const {saleIssue}=require('./sale-quality.cjs');
function preferences(texts=[],seeds=[]){
 const text=normalize(texts.join(' ')),excludedMakes=new Set();
 // Apply choices in conversation order. A later mention or "all makes"
 // releases an earlier rejection, including when both occur in one message.
 for(const message of texts){const value=normalize(message);if(/alla marken|vilket marke som helst/.test(value))excludedMakes.clear();for(const make of require('./search-query.cjs').makes){const name=normalize(make);for(const match of value.matchAll(new RegExp('\\b'+name+'\\b','g'))){if(/(?:inte(?: ha)?|ingen|inga|utom) $/.test(value.slice(0,match.index)))excludedMakes.add(make);else excludedMakes.delete(make);}}}
 return {
  first:/forsta bil|nyborjare|pendl|billig.*(?:aga|drift)|lag.*(?:drift|kostnad)/.test(text),
  family:/familj|barn|rymlig|stor bagage|barnvagn/.test(text),
  sporty:/sportig|rolig|kor(glad|kansla)|korupplevelse/.test(text),
  project:/projektbil|reparationsobjekt|reservdel|mek(a|projekt)/.test(text),
  lowMileage:/lagre miltal|lagt miltal|farre mil/.test(texts.at(-1)?normalize(texts.at(-1)):''),
  excludedMakes:[...excludedMakes],
  seeds:seeds.map(c=>({make:c.make,model:c.model,bodyType:c.bodyType,price:c.price,fuel:c.fuel,gearbox:c.gearbox}))
 };
}
function candidateScore(car,p={},filters={}){
 if(car.active===false||saleIssue(car)||p.excludedMakes?.some(m=>normalize(m)===normalize(car.make)))return -Infinity;
 const text=normalize([car.title,car.variant,car.description].join(' '));
 const repair=/reparationsobjekt|reservdelsbil|projektbil|motor(?:haveri|fel)|vaxelladsfel|startar inte|ej korbar|korsforbud|skrotbil/.test(text);
 let score=0;if(repair&&!p.project)score-=150;else if(repair&&p.project)score+=50;
 // Rank useful evidence, not an invented reliability rating. Missing data loses
 // to known values; the model must still inspect the seller's original text.
 if(car.mileage!=null)score+=Math.max(-35,30-car.mileage/(p.lowMileage?350:800));else score-=20;
 if(car.year!=null)score+=Math.max(-20,Math.min(25,(car.year-2000)*1.2));else score-=10;
 if(car.images?.length)score+=3;
 const budget=filters.maxPrice;if(budget){const ratio=car.price/budget;score+=Math.min(15,ratio*20);if(ratio<.12&&!p.project)score-=15;}else score-=Math.log10(Math.max(1000,car.price))*2;
 if(p.first){if(/halvkombi/i.test(car.bodyType||''))score+=12;if(/jazz|yaris|corolla|auris|civic|mazda 2|fiesta|polo|fabia|swift|i20|i30|cee d|rio|micra|clio|corsa/.test(normalize(car.model)))score+=12;if(car.fuel==='Bensin')score+=4;if(car.mileage>25000)score-=15;}
 if(p.family&&/kombi|minibuss|suv/i.test(car.bodyType||''))score+=15;
 if(p.sporty&&/coupe|cabriolet/i.test(normalize(car.bodyType)))score+=12;
 if(p.seeds?.length){const seed=p.seeds[0];if(car.bodyType&&car.bodyType===seed.bodyType)score+=12;if(car.make===seed.make)score+=6;if(car.model===seed.model)score+=8;if(car.fuel===seed.fuel)score+=3;}
 return score;
}
function rankCandidates(cars,p={},filters={},excludeIds=[],limit=48){
 const excluded=new Set(excludeIds),sorted=cars.filter(c=>!excluded.has(c.id)).map(car=>({car,score:candidateScore(car,p,filters)})).filter(x=>Number.isFinite(x.score)).sort((a,b)=>b.score-a.score||a.car.price-b.car.price),counts=new Map(),selected=[],later=[];
 for(const {car} of sorted){const group=normalize(car.make+' '+car.model),n=counts.get(group)||0;if(n>=3)later.push(car);else{selected.push(car);counts.set(group,n+1);}}
 return [...selected,...later].slice(0,limit);
}
module.exports={preferences,candidateScore,rankCandidates};

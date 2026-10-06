const catalog=[
  ['BMW','3-serie','320d','Sedan','Diesel',2017,12000,139900,'#688594'],
  ['BMW','3-serie','320d','Sedan','Diesel',2018,11200,179900,'#aaadb2'],
  ['BMW','3-serie','320d','Sedan','Diesel',2017,12700,184900,'#303e46'],
  ['BMW','3-serie','320d','Sedan','Diesel',2016,13200,169900,'#899d86'],
  ['BMW','3-serie','320d','Sedan','Diesel',2018,12100,189900,'#b29b7d'],
  ['BMW','3-serie','320d','Sedan','Diesel',2017,10800,174900,'#738b9b'],
  ['BMW','3-serie','320d','Sedan','Diesel',2019,13900,194900,'#6e747b'],
  ['BMW','3-serie','320d','Sedan','Diesel',2016,11600,179900,'#959a90'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2017,13400,144900,'#747f8c'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2017,12300,168900,'#8d9caa'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2018,14500,174900,'#303b46'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2016,13500,164900,'#a4aaa0'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2017,15200,169900,'#9b766b'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2018,14400,184900,'#9aabb1'],
  ['Audi','A4','2.0 TDI','Kombi','Diesel',2016,13900,159900,'#6c7981'],
  ['Volvo','V60','D4','Kombi','Diesel',2018,12800,179900,'#8e998b'],
  ['Volvo','XC60','B4','SUV','Diesel',2021,6400,349900,'#929896'],
  ['Volkswagen','Golf','1.4 TSI','Halvkombi','Bensin',2018,8900,149900,'#8faca6'],
  ['Tesla','Model 3','Long Range','Sedan','El',2021,7500,269900,'#909aa2'],
  ['Kia','Niro','Plug-in','SUV','Laddhybrid',2020,8200,219900,'#8aa294'],
  ['Toyota','Corolla','1.8','Kombi','Hybrid',2021,6700,229900,'#8998aa'],
  ['Škoda','Octavia','1.5 TSI','Kombi','Bensin',2019,10400,169900,'#a09a8b'],
  ['BMW','5-serie','520d','Kombi','Diesel',2019,11000,239900,'#819097'],
  ['Audi','A3','1.4 TFSI','Halvkombi','Bensin',2016,11800,129900,'#9ca391']
];
function seedDemo(store) {
  if(store.search({},true).total)return;
  const sources=[{id:'demo-a',name:'Demoflöde A',enabled:true,demo:true,mediaAllowed:false},{id:'demo-b',name:'Demoflöde B',enabled:true,demo:true,mediaAllowed:false}];sources.forEach(s=>store.setSource(s));
  const listings=catalog.map(([make,model,variant,bodyType,fuel,year,mileage,price,color],i)=>({id:String(i),registration:'D'+String(i).padStart(5,'0'),make,model,variant,bodyType,fuel,year,mileage,price,color,title:`${make} ${model} ${variant}`,gearbox:i===21?'Manuell':'Automat',url:`https://example.com/carcrow-demo/${i}`,city:['Stockholm','Göteborg','Malmö','Uppsala','Örebro'][i%5],seller:'Exempelhandlare',description:'Det här är en syntetisk testannons. Bilen, priset och handlaren är exempel för att prova appens funktioner. Inga testannonser finns till försäljning.',images:[],publishedAt:new Date(Date.now()-i*3600000).toISOString()}));
  // Color is visual metadata only; no fake marketplace photos or links.
  store.importSnapshot(sources[0],{schemaVersion:1,complete:true,listings});
  store.importSnapshot(sources[1],{schemaVersion:1,complete:true,listings:[{...listings[0],id:'crosslisted',price:144900}]});
  for(let i=0;i<listings.length;i++){const r=store.rows('SELECT id,data FROM listings WHERE id=?',['demo-a:'+i])[0];const data=JSON.parse(r.data);data.color=catalog[i][8];store.db.run('UPDATE listings SET data=? WHERE id=?',[JSON.stringify(data),r.id]);}store.save();
}
module.exports={seedDemo};

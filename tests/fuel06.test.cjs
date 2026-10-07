const test=require('node:test'),assert=require('node:assert/strict');
const {Store}=require('../electron/core.cjs');
const {parseBytbilDetail,parseWaykeDetail,listURL}=require('../electron/html-sources.cjs');
const {parseWebListing}=require('../electron/web-listings.cjs');
const source={id:'bytbil',name:'Bytbil',enabled:true,mediaAllowed:true,hosts:['www.bytbil.com']};
function bytbil(title,id){
  const fields={'Märke':'Kia','Modell':'Niro','Årsmodell':'2020',Miltal:'10 367 mil',Drivmedel:'Hybrid el/bensin','Växellåda':'Automatisk'};
  return parseBytbilDetail(`<h1 class="vehicle-detail-title">${title}</h1><div class="vehicle-detail-price">189 900 kr</div><div class="object-info-box"><dl>${Object.entries(fields).map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></div>`,`https://www.bytbil.com/car-${id}`);
}
const schema={ '@context':'https://schema.org','@type':'Car',name:'Kia Niro PHEV DCT',brand:{name:'Kia'},model:'Niro',vehicleConfiguration:'DCT',vehicleModelDate:'2020',vehicleTransmission:'Automat',fuelType:'Hybrid',mileageFromOdometer:{value:103670,unitCode:'KMT'},offers:{price:189900,priceCurrency:'SEK'}};
const html=d=>'<script type="application/ld+json">'+JSON.stringify(d)+'</script>';
test('explicit PHEV titles fix Bytbil fuel without reclassifying HEV, MHEV or ambiguous variants',async()=>{
  const s=await Store.create();s.setSource(source);
  const titles=['Kia Niro PHEV DCT','Kia Niro P-HEV DCT','Kia Niro P HEV DCT','Kia Niro Hybrid HEV','Kia Niro MHEV','Kia Niro GTE'];
  const ads=titles.map((title,i)=>bytbil(title,i+1));
  assert.deepEqual(ads.map(ad=>ad.fuel),['Laddhybrid','Laddhybrid','Laddhybrid','Hybrid','Hybrid','Hybrid']);
  s.importSnapshot(source,{schemaVersion:1,complete:false,listings:ads});
  assert.equal(s.search({fuelTypes:['Laddhybrid']}).total,3);assert.equal(s.search({fuelTypes:['Hybrid']}).total,3);s.db.close();
});
test('Bytbil plug-in searches retrieve broad source categories once before strict local filtering',()=>{
  const f=new URL(listURL('bytbil',{fuelTypes:['Laddhybrid','Hybrid']},'Kia')).searchParams.getAll('Fuels');
  assert.ok(f.includes('Hybrid el/bensin'));assert.ok(f.includes('Hybrid el/diesel'));assert.ok(f.includes('Laddhybrid'));assert.equal(new Set(f).size,f.length);
});
test('Wayke and web originals recognize explicit plug-in titles while unknown fuel stays unknown',()=>{
  const wayke=parseWaykeDetail(html(schema)+'<dl><dt>Motortyp</dt><dd>Hybrid</dd></dl>','https://www.wayke.se/objekt/niro');assert.equal(wayke.fuel,'Laddhybrid');
  assert.equal(parseWebListing(html(schema),'https://dealer.example/niro').fuel,'Laddhybrid');
  assert.equal(parseWebListing(html({...schema,name:'Kia Niro',fuelType:undefined}),'https://dealer.example/niro').fuel,null);
  assert.equal(parseWebListing(html({...schema,name:'Kia Niro HEV'}),'https://dealer.example/niro').fuel,'Hybrid');
});
test('Riddermark list and shared imports preserve explicitly declared plug-in variants',async()=>{
  const car={id:1,title:'Kia Niro PHEV',make:'Kia',model:'Niro',modelYear:2020,mileage:10367,price:189900,fuelType:'Hybrid',gearboxType:'Automatisk',licenseplate:'ABC123'};
  const page='<script id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{carsJson:[car]}}})+'</script><a href="/kopa-bil/kia/abc123/">Bil</a>';
  assert.equal(require('../electron/dealer-sources.cjs').riddermarkPage(page).listings[0].fuel,'Laddhybrid');
  const s=await Store.create();s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[{...bytbil('Kia Niro PHEV',1),fuel:'Hybrid'}]});assert.equal(s.search({fuelTypes:['Laddhybrid']}).total,1);s.db.close();
});
test('old hybrid cache migration preserves saved IDs and timestamps and only corrects explicit PHEVs',async()=>{
  const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'carcrow-fuel-')),file=path.join(dir,'cars.sqlite');
  let s;try{
    s=await Store.create(file);s.setSource(source);s.importSnapshot(source,{schemaVersion:1,complete:false,listings:[bytbil('Kia Niro PHEV',1),bytbil('Kia Niro HEV',2)]});
    const row=s.rows('SELECT * FROM listings WHERE id=?',['bytbil:1'])[0],ad=JSON.parse(row.data);ad.fuel='Hybrid';
    s.db.run('UPDATE listings SET fuel=?,data=? WHERE id=?',['Hybrid',JSON.stringify(ad),row.id]);s.bookmark(row.vehicle_id);s.setSetting('plugInFuel06',false);s.save();s.db.close();s=null;
    s=await Store.create(file);const after=s.rows('SELECT * FROM listings WHERE id=?',[row.id])[0];
    assert.equal(s.search({fuelTypes:['Laddhybrid']}).total,1);assert.equal(s.search({fuelTypes:['Hybrid']}).total,1);assert.equal(after.vehicle_id,row.vehicle_id);assert.equal(after.first_seen,row.first_seen);assert.equal(after.last_seen,row.last_seen);assert.equal(s.detail(row.vehicle_id).saved,true);
  }finally{s?.db.close();fs.rmSync(dir,{recursive:true,force:true});}
});

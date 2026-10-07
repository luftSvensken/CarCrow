// Rebuild the bundled gazetteer from GeoNames' SE.txt and admin1CodesASCII.txt.
// Both files: https://download.geonames.org/export/dump/ — CC BY 4.0.
const fs=require('node:fs'),path=require('node:path');
const [countryFile,adminFile]=process.argv.slice(2);if(!countryFile||!adminFile)throw new Error('Ange SE.txt och admin1CodesASCII.txt.');
const admins=new Map(fs.readFileSync(adminFile,'utf8').split('\n').filter(r=>r.startsWith('SE.')).map(r=>{const c=r.split('\t');return [c[0].slice(3),c[1]];}));
const places=fs.readFileSync(countryFile,'utf8').split('\n').filter(Boolean).map(r=>r.split('\t')).filter(c=>c[6]==='P'&&c[8]==='SE'&&!['PPLQ','PPLW','PPLH','PPLCH'].includes(c[7])).map(c=>({id:Number(c[0]),name:c[1],aliases:[...new Set([c[2],...c[3].split(',')].filter(Boolean))].slice(0,20),latitude:Number(c[4]),longitude:Number(c[5]),population:Number(c[14]),county:admins.get(c[10])||''})).sort((a,b)=>b.population-a.population);
const data={source:'https://download.geonames.org/export/dump/SE.zip',license:'CC BY 4.0',attribution:'GeoNames',retrievedAt:'2026-10-07',places};
fs.writeFileSync(path.join(__dirname,'../electron/swedish-places.json'),JSON.stringify(data));console.log('GeoNames: '+places.length+' orter.');

const tokens=require('./blocket-brands.json');
const labels={'MERCEDES_BENZ':'Mercedes-Benz','CITROEN':'Citroën','SKODA':'Skoda','MINI':'MINI','SEAT':'SEAT','DS_AUTOMOBILES':'DS Automobiles'};
const displayBrands=tokens.map(token=>labels[token]||token.split('_').map(w=>w.length<=3?w:w[0]+w.slice(1).toLowerCase()).join(' '));
const token=s=>String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,'_');
module.exports={tokens,displayBrands,brandToken:token};

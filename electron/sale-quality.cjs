// A nominal amount is not evidence that a car can be bought for that amount.
// Restrict buying-ad detection to the headline/variant: normal dealers often
// advertise their trade-in service in the description of a genuine sale.
function saleIssue(ad){
 if(Number(ad.price)<=100)return 'Annonsen använder ett symboliskt pris (högst 100 kr).';
 const heading=[ad.title,ad.variant].filter(Boolean).join(' ').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(?:vi koper|kopes|koper din|bilar sokes|bilar koper vi)\b/.test(heading))return 'Köpesannons, inte en bil till salu.';
 const body=String(ad.description||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/privatleasing|leasingavtal|leasingkostnad|leasingtagare/.test(body)){
  const monthly=[...body.matchAll(/(\d[\d \u00a0\u202f]*)\s*(?:kr|:-)\s*(?:\/\s*man|per manad)/g)].some(m=>Number(m[1].replace(/\s/g,''))===Number(ad.price));
  if(monthly||/(?:overlat(?:es|else)|ta over|overtagande).{0,90}leas|leas.{0,90}(?:overlat(?:es|else)|ta over|overtagande)/.test(body))return 'Leasingöverlåtelse eller månadspris, inte ett kontantpris för bilen.';
 }
 return null;
}
module.exports={saleIssue};

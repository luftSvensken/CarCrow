const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
// Read one monetary amount, never concatenate a payment, deposit and total.
function cashAmount(value){
 if(typeof value==='number')return Number.isInteger(value)&&value>0?value:null;
 const m=String(value||'').trim().match(/^(\d[\d \u00a0\u202f]*)(?:[.,]00)?\s*(?:kr|sek|kronor|:-)?$/i);
 return m?Number(m[1].replace(/\s/g,'')):null;
}
function amounts(text,pattern){return [...norm(text).matchAll(pattern)].map(m=>Number(m[1].replace(/\s/g,'')));}
function cashSaleAssessment(ad){
 const price=Number(ad.price),heading=norm([ad.title,ad.variant].filter(Boolean).join(' ')),body=norm(ad.description);
 const result=(kind,issue=null,needsVerification=false)=>({kind,issue,needsVerification});
 if(price<=100)return result('symbolic','Annonsen använder ett symboliskt pris (högst 100 kr).');
 if(/\b(?:vi koper|kopes|koper din|bilar sokes|bilar koper vi)\b/.test(heading))return result('buying','Köpesannons, inte en bil till salu.');
 const specs=ad.priceSpecification||{},basis=norm([ad.priceType,ad.priceKind,ad.saleType,ad.saleForm,ad.businessFunction,ad.priceUnit,ad.pricePeriod,specs.unitText,specs.unitCode,specs.billingDuration,specs.priceType,specs.businessFunction].filter(Boolean).join(' '));
 const primary=norm(ad.priceText),monthly=/\/\s*(?:man(?:ad)?|month)|per\s+(?:manad|month)|\b(?:monthly|month|mon|p1m|manadskostnad|manadspris)\b/;
 if(monthly.test(primary+' '+basis)||/lease|leasing|rent|hyra/.test(basis))return result('monthly','Månadspris eller leasing, inte bilens kontantpris.');
 if(/downpayment|deposit|kontantinsats|handpenning|forhojd.*(?:avgift|hyra)/.test(basis+' '+primary))return result('deposit','Kontantinsats eller handpenning, inte bilens totalpris.');
 if(/auction|bid|budpris|hogsta bud|utropspris/.test(basis+' '+primary))return result('auction','Bud eller utropspris, inte ett fast kontantpris.');
 const all=heading+' '+body;
 const explicitCash=Number(ad.cashPrice)===price||amounts(all,/(?:kontantpris|koppris|totalpris|pris kontant|cash price)\s*[:=]?\s*(\d[\d \u00a0\u202f]*)/g).includes(price);
 const payments=amounts(all,/(\d[\d \u00a0\u202f]*)\s*(?:kr|sek|:-)?\s*(?:\/\s*man(?:ad)?|per manad|i manaden|manadskostnad)/g);
 const prefix=amounts(all,/(?:manadspris|manadskostnad|leasing(?:pris)?|kontantinsats|handpenning)\s*(?:fran|pa|:)?\s*(\d[\d \u00a0\u202f]*)/g);
 if(!explicitCash&&(payments.includes(price)||prefix.includes(price)))return result('monthly','Annonspriset avser betalning per månad eller insats, inte ett kontantpris.');
 if(/(?:overlat(?:es|else)|ta over|overtagande).{0,90}leas|leas.{0,90}(?:overlat(?:es|else)|ta over|overtagande)/.test(all))return result('lease','Leasingöverlåtelse, inte en bil till salu för kontantpriset.');
 if(!explicitCash&&/privatleasing|leasingerbjudande|\bleasing\b/.test(heading))return result('lease','Leasingerbjudande utan verifierat kontantpris.');
 if(explicitCash)return result('purchase');
 // A finance example with a different payment never invalidates a cash sale.
 const ambiguous=/leas|manadspris|manadskostnad|kontantinsats/.test(body)&&!payments.length;
 return result('unknown',null,ambiguous||(ad.year>=2018&&price<15000));
}
function saleIssue(ad){return cashSaleAssessment(ad).issue;}
module.exports={saleIssue,cashSaleAssessment,cashAmount};

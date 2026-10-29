import type {DB,Purchase} from './logic';
export type CostMode='historical'|'replacement';
export interface PurchaseCosting {purchaseId:string;revision:number;pricesIncludeVat?:boolean;vatRatePct?:number;shippingVatRatePct?:number;otherCosts?:number;otherVatRatePct?:number;lineVatRates?:Record<string,number>;originalLineValues?:Record<string,number>;source?:string}
export interface LandedCost {unit:number|null;merchandise:number|null;shipping:number|null;vat:number|null;other:number|null;quantity:number;notes:string[]}
const r=(v:number)=>Math.round((v+Number.EPSILON)*1e6)/1e6;
export function purchaseBreakdown(p:Purchase,mode:CostMode,settings?:PurchaseCosting,recoverVat=false){
 const included=settings?.pricesIncludeVat??p.pricesIncludeVat??false;
 const lineValues=p.lines.map(l=>settings?.originalLineValues?.[l.id]??l.lineTotal),original=lineValues.reduce((n,v)=>n+v,0);
 const taxableHistorical=p.subtotal-p.discount+p.shipping;
 // A uniform rate may be reconstructed only when the recorded invoice reconciles.
 const taxBase=included?taxableHistorical-p.vat:taxableHistorical;
 const implied=taxBase>0?p.vat/taxBase*100:0;
 const simple=Math.round(implied*2)/2;
 const rounded=simple;
 const reconciles=Math.abs(taxBase*rounded/100-p.vat)<=0.03;
 const rate=settings?.vatRatePct??(p.vat===0?0:reconciles&&rounded>0?rounded:undefined);
 const shippingRate=settings?.shippingVatRatePct??rate,otherRate=settings?.otherVatRatePct??rate;
 const other=settings?.otherCosts||0;
 const historicalGross=p.subtotal-p.discount+p.shipping+(included?0:p.vat);
 const historicalVat=p.vat;
 const taxWeights=p.lines.map((l,i)=>{const share=original>0?lineValues[i]/original:0,lr=settings?.lineVatRates?.[l.id]??rate;if(lr===undefined||shippingRate===undefined)return share;const discounted=lineValues[i]-p.discount*share;return discounted/(included?1+lr/100:1)*lr/100+p.shipping*share/(included?1+shippingRate/100:1)*shippingRate/100});
 const totalTaxWeight=taxWeights.reduce((n,v)=>n+v,0);
 const netWeights=p.lines.map((l,i)=>{const share=original>0?lineValues[i]/original:0,lr=settings?.lineVatRates?.[l.id]??rate;return (lineValues[i]-p.discount*share)/(included&&lr!==undefined?1+lr/100:1)+p.shipping*share/(included&&shippingRate!==undefined?1+shippingRate/100:1)}),totalNetWeight=netWeights.reduce((n,v)=>n+v,0);
 const notes:string[]=[];
 if(settings?.vatRatePct===undefined&&p.vat>0&&rate!==undefined)notes.push(`VAT ${rate}% reconstructed from the recorded invoice totals. Review tax settings if the purchase contains mixed VAT rates.`);
 if(mode==='replacement'&&rate===undefined)notes.push('VAT rate could not be reconciled from this invoice. Record the applicable line and shipping tax rates.');
 const rows=p.lines.map((l,i)=>{
  const share=original>0?lineValues[i]/original:0,lr=settings?.lineVatRates?.[l.id]??rate;
  if(mode==='historical'){
   const vat=historicalVat*(totalTaxWeight>0?taxWeights[i]/totalTaxWeight:share),shipping=p.shipping*share/(included&&shippingRate!==undefined?1+shippingRate/100:1);
   const additionalTax=otherRate===undefined?null:other*otherRate/100*share;
   const net=(historicalGross-historicalVat)*(totalNetWeight>0?netWeights[i]/totalNetWeight:share),gross=net+vat+other*share+(additionalTax??0);
   return {id:l.id,merchandise:r(net-shipping),shipping:r(shipping),other:r(other*share),vat:r(vat+(additionalTax??0)),total:other&&additionalTax===null?null:r(gross-(recoverVat?vat+(additionalTax??0):0))};
  }
  if(lr===undefined||shippingRate===undefined||other>0&&otherRate===undefined)return {id:l.id,merchandise:null,shipping:null,other:null,vat:null,total:null};
  const merchandise=lineValues[i]/(included?1+lr/100:1),shipping=p.shipping*share/(included?1+shippingRate/100:1),direct=other*share;
  const vat=merchandise*lr/100+shipping*shippingRate/100+direct*(otherRate||0)/100;
  return {id:l.id,merchandise:r(merchandise),shipping:r(shipping),other:r(direct),vat:r(vat),total:r(merchandise+shipping+direct+(recoverVat?0:vat))};
 });
 return {rows,notes,rate,total:rows.some(l=>l.total===null)?null:r(rows.reduce((n,l)=>n+(l.total||0),0))};
}
export function landedCost(db:DB,id:string,mode:CostMode='replacement',recoverVat=false,settings:PurchaseCosting[]=[]):LandedCost{
 const item=db.items.find(i=>i.id===id),unknown=():LandedCost=>({unit:null,merchandise:null,shipping:null,vat:null,other:null,quantity:0,notes:['No complete recorded purchase valuation.']});
 if(!item||item.opening>0)return unknown();
 let quantity=0,merchandise=0,shipping=0,vat=0,other=0,total=0;const notes:string[]=[];let complete=true;
 for(const p of db.purchases){const breakdown=purchaseBreakdown(p,mode,settings.find(s=>s.purchaseId===p.id),recoverVat);
  p.lines.forEach((l,i)=>{if(l.status!=='ready'||l.unit!==item.unit||!l.perPackage||!(l.id===id||l.name.toLowerCase()===item.name.toLowerCase()))return;
   const q=l.packages*l.perPackage;if(q<=0)return;quantity+=q;const row=breakdown.rows[i];notes.push(...breakdown.notes);if(row.total===null){complete=false;return}total+=row.total;merchandise+=row.merchandise||0;shipping+=row.shipping||0;vat+=recoverVat?0:row.vat||0;other+=row.other||0;
  });
 }
 if(!quantity||!complete)return {...unknown(),quantity,notes:[...new Set(notes.length?notes:['Missing purchase cost.'])]};
 return {unit:r(total/quantity),merchandise:r(merchandise/quantity),shipping:r(shipping/quantity),vat:r(vat/quantity),other:r(other/quantity),quantity,notes:[...new Set(notes)]};
}

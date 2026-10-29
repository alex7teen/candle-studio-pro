import {landedCost,type CostMode,type PurchaseCosting} from './landed-cost';
import type { DB } from './logic';

export type CandleType = 'Container' | 'Pillar' | 'Silicone Mould' | 'Wax Melt' | 'Layered/Decorative Candle';
export const candleTypes: CandleType[] = ['Container','Pillar','Silicone Mould','Wax Melt','Layered/Decorative Candle'];
export type MaterialKind = 'wax'|'fragrance'|'dye'|'wick'|'container'|'packaging'|'equipment'|'other';
export interface Specification {
 fieldSources?:Record<string,{source:string;retrievedAt:string;verified:boolean}>;
 image?:string; retrievedAt?:string; verificationStatus?:string; nominalMl?:number; insideDiameterMm?:number; outerDiameterMm?:number; outerHeightMm?:number; innerHeightMm?:number; approxWaxCapacityG?:number;
 compatibilityText?:string; fragranceGuidance?:string; dyeGuidance?:string; meltGuidance?:string; mixGuidance?:string; pourGuidance?:string; packDescription?:string; safetyGuidance?:string; technicalDocument?:string;
  verified?: boolean; source?: string; verifiedAt?: string; supplier?: string; productRef?: string; lot?: string;
  candleTypes?: CandleType[]; compatibleWaxIds?: string[]; minFragrancePct?: number; maxFragrancePct?: number;
  fragranceBasis?: 'wax'|'mixture'; maxDyePct?: number; densityGml?: number; meltC?: number; mixC?: number; pourC?: number;
  cure?: string; wickMinDiameterMm?: number; wickMaxDiameterMm?: number; wickNotes?: string;
  sds?: string; clp?: string; fragranceDocumentation?: string; notes?: string;
}
export interface Material { id:string; name:string; unit:'g'|'ml'|'pcs'; kind:MaterialKind; specification:Specification; revision:number }
export interface Container { id:string; itemId:string; name:string; nominalMl?:number; usableMl?:number; measuredAt?:string; measurementNotes?:string; insideDiameterMm?:number; usableHeightMm?:number; emptyWeightG?:number; revision:number }
export interface Mould { id:string; name:string; brand?:string; supplier?:string; productUrl?:string; image?:string; purchasePrice?:number; material?:string; heatResistance?:string; dimensions?:string; quantity:number; notes?:string; compatibleWaxIds?:string[]; compatibilitySource?:string; revision:number }
export interface Cavity { id:string; mouldId:string; name:string; count:number; dimensions?:string; capacityMl?:number; shape?:string; revision:number }
export interface Formulation { waxId:string; fragranceId?:string; fragrancePct:number; dyeId?:string; dyePct:number; colour?:string }
export interface Calibration { id:string; cavityId:string; waxId?:string; formulation:Formulation; method:'water-volume'|'water-mass'|'actual-wax'; weightG?:number; volumeMl?:number; waterMassG?:number; waterDensityGml?:number; notes:string; date:string }
export interface Decoration { id:string; cavityId:string; calibrationId?:string; name:string; category?:string; image?:string; notes?:string; formulation:Formulation; revision:number; archived?:boolean }
export interface Layer extends Formulation { id:string; name:string; mode:'wax'|'mixture'|'volume'; weightG:number; fillPct:number; mixtureDensityGml?:number; densitySource?:string; densityDate?:string; visualColour:string }
export interface DecorationPart { id:string; decorationId:string; quantity:number; source:'stock'|'new'|'mixed' }
export interface PackagingPart { id:string; itemId:string; quantity:number; role?:'safety-label'|'adhesive'|'packaging' }
export interface Pricing {
 labour:number; overhead:number; other:number; feePct:number; fixedFee:number; markupPct:number; marginPct:number;
 costMode?:CostMode; strategy:'margin'|'markup'; vatRegistered:boolean; outputVatPct:number; recoverInputVat:boolean; sellingPrice?:number;
}
export const defaultPricing: Pricing={costMode:'replacement',labour:0,overhead:0,other:0,feePct:0,fixedFee:0,markupPct:50,marginPct:40,strategy:'margin',vatRegistered:false,outputVatPct:0,recoverInputVat:false};
export interface Recipe {
 wizardProgress?:{step:number;quantity:number};
 id:string; version:number; name:string; type:CandleType; containerId?:string; mouldId?:string; cavityId?:string; wickId?:string;
 layers:Layer[]; decorations:DecorationPart[]; packaging:PackagingPart[]; lossPct:number; pricing:Pricing;
 notes:string; draft:boolean; archived?:boolean; placement:{verified:boolean; headspace:boolean; wickClearance:boolean; fit:boolean; notes:string};
 decorationSnapshots?:Decoration[]; containerSnapshot?:Container;
}
export interface Quality { id:string; sequence?:number; recipeId:string; recipeVersion:number; productionId?:string; kind:'burn'|'compliance'|'inspection'; outcome:'pass'|'fail'|'pending'; date:string; notes:string; evidence?:string; batchNumber?:string; classification?:string; checks?:Record<string,boolean> }
export interface DecorationMovement { id:string; decorationId:string; decorationRevision?:number; productionId:string; quantity:number; unitCost:number; notes:string }
export interface Production { id:string; batchNumber:string; kind:string; quantity:number; recipeId?:string; recipeVersion?:number; decorationId?:string; snapshot:any; date:string; reverses?:string }
export interface ManufacturingState { workspace:DB; workspaceRevision:number; materials:Material[]; containers:Container[]; moulds:Mould[]; cavities:Cavity[]; calibrations:Calibration[]; decorations:Decoration[]; recipes:Recipe[]; quality:Quality[]; decorationMovements:DecorationMovement[]; production:Production[]; plans?:any[]; purchaseCosting?:PurchaseCosting[] }
export interface Issue { level:'red'|'amber'; code:string; message:string; component?:string; suggestions?:{pct:number; fragranceG:number; savingG:number}[] }
export interface Requirement { itemId:string; name:string; unit:string; quantity:number; available:number; shortfall:number; remaining:number; unitCost:number|null; cost:number|null; category:string }
export interface LayerResult { id:string; name:string; waxG:number; fragranceG:number; dyeG:number; mixtureG:number; volumeMl:number|null }
export interface FigureResult { decorationId:string; name:string; required:number; premade:number; manufacture:number; weightG:number|null; cost:number|null; mouldId:string; cavityId:string; rounds:number; finalCavities:number; avoidedOverproductionG:number }
export interface CostResult { materials:number|null; labour:number; overhead:number; other:number; total:number|null; unit:number|null; suggested:number|null; breakEven:number|null; expectedProfit:number|null; marginPct:number|null; valuation:string }
export interface Plan { count:number; layers:LayerResult[]; requirements:Requirement[]; figures:FigureResult[]; issues:Issue[]; status:'red'|'amber'|'green'; massG:number; mixtureG:number; volumeMl:number|null; finishedProductG:number|null; maxCandles:number; costs:CostResult; canConfirm:boolean; burnApproved:boolean; complianceReviewed:boolean; mouldRounds:{mouldId:string;name:string;rounds:number}[] }

// Decimal arithmetic: micro-units, half-up intermediates and conservative final
// stock requirements. All decimal inputs are bounded to six decimal places.
export const SCALE=1_000_000n;
export function fixed(value:number|string):bigint {
  const text=typeof value==='number' ? value.toFixed(6) : value;
  if(!/^-?\d+(\.\d{1,6})?$/.test(text))throw Error('Invalid decimal quantity');
  const negative=text.startsWith('-'),[whole,fraction='']=text.replace('-','').split('.');
  return (BigInt(whole)*SCALE+BigInt(fraction.padEnd(6,'0')))*(negative?-1n:1n);
}
export const decimal=(n:bigint)=>Number(n)/1e6;
export function divide(a:bigint,b:bigint):bigint {if(b<=0n)throw Error('Invalid divisor');return (a*SCALE+b/2n)/b}
export const multiply=(a:bigint,b:bigint)=>(a*b+SCALE/2n)/SCALE;
export const round=(n:number,places=6)=>Number(n.toFixed(places));
export const formulationKey=(f:Formulation)=>[f.waxId,f.fragranceId||'',round(f.fragrancePct),f.dyeId||'',round(f.dyePct)].join('|');
export function mix(weightG:number,pct:number,dyePct=0,mode:'wax'|'mixture'='wax') {
 const weight=fixed(weightG),ratio=divide(fixed(pct),fixed(100)),dyeRatio=divide(fixed(dyePct),fixed(100));
 const wax=mode==='wax'?weight:divide(weight,SCALE+ratio+dyeRatio);
 const fragrance=multiply(wax,ratio),dye=multiply(wax,dyeRatio);
 return {waxG:decimal(wax),fragranceG:decimal(fragrance),dyeG:decimal(dye),mixtureG:decimal(wax+fragrance+dye)};
}
export function stock(db:DB,id:string){const item=db.items.find(i=>i.id===id);return decimal(db.movements.filter(m=>m.itemId===id).reduce((n,m)=>n+fixed(m.quantity),fixed(item?.opening||0)))}
export function decorationStock(state:ManufacturingState,id:string,revision?:number){return state.decorationMovements.filter(m=>m.decorationId===id&&(revision===undefined||(m.decorationRevision||1)===revision)).reduce((n,m)=>n+m.quantity,0)}
export function decorationCost(state:ManufacturingState,id:string,revision?:number):number|null {
 const receipts=state.decorationMovements.filter(m=>m.decorationId===id&&m.quantity>0&&!m.notes.startsWith('Reversal')&&(revision===undefined||(m.decorationRevision||1)===revision));
 const qty=receipts.reduce((n,m)=>n+m.quantity,0);return qty?round(receipts.reduce((n,m)=>n+m.quantity*m.unitCost,0)/qty):null;
}
export function receiptCost(db:DB,id:string,recoverVat=false,mode:CostMode='historical',settings:PurchaseCosting[]=[]):number|null {return landedCost(db,id,mode,recoverVat,settings).unit}
export function calibratedWeight(state:ManufacturingState,decoration:Decoration):number|null {
 const c=state.calibrations.find(c=>c.id===decoration.calibrationId&&c.cavityId===decoration.cavityId);
 if(!c||c.method!=='actual-wax'||formulationKey(c.formulation)!==formulationKey(decoration.formulation)||!c.weightG)return null;
 return c.weightG;
}
export function estimateDecorationCost(state:ManufacturingState,d:Decoration):number|null{
 const weight=calibratedWeight(state,d);if(weight===null)return null;
 const amounts=mix(weight,d.formulation.fragrancePct,d.formulation.dyePct,'mixture');let total=0;
 for(const [id,grams] of [[d.formulation.waxId,amounts.waxG],[d.formulation.fragranceId,amounts.fragranceG],[d.formulation.dyeId,amounts.dyeG]] as [string|undefined,number][]){
  if(grams<=0)continue;const material=state.materials.find(m=>m.id===id),cost=receiptCost(state.workspace,id||'');if(!material||cost===null)return null;
  if(material.unit==='ml'&&(!material.specification.verified||!material.specification.source||!material.specification.verifiedAt||!material.specification.densityGml))return null;
  total+=grams*cost/(material.unit==='ml'?material.specification.densityGml!:1);
 }
 return round(total);
}
export function projectedWaterCalibration(c:Calibration,density?:number):{ml:number|null;grams:number|null}{
 const ml=c.method==='water-volume'?c.volumeMl??null:c.method==='water-mass'&&c.waterDensityGml&&c.waterMassG?round(c.waterMassG/c.waterDensityGml):null;
 return {ml,grams:ml!==null&&density?round(ml*density):null};
}
function estimateDecorationReplacement(state:ManufacturingState,d:Decoration,recipe:Recipe):number|null {
 const weight=calibratedWeight(state,d);if(weight===null)return null;const m=mix(weight,d.formulation.fragrancePct,d.formulation.dyePct,'mixture');let total=0;
 for(const [id,g] of [[d.formulation.waxId,m.waxG],[d.formulation.fragranceId,m.fragranceG],[d.formulation.dyeId,m.dyeG]] as [string|undefined,number][]){if(g<=0)continue;const material=state.materials.find(m=>m.id===id),c=receiptCost(state.workspace,id||'',recipe.pricing.vatRegistered&&recipe.pricing.recoverInputVat,'replacement',state.purchaseCosting);if(c===null||!material)return null;if(material.unit==='ml'&&(!material.specification.verified||!material.specification.densityGml))return null;total+=g*c/(material.unit==='ml'?material.specification.densityGml!:1)}return round(total*(1+recipe.lossPct/100));
}
export function initialRecipe():Recipe{return {id:crypto.randomUUID(),version:0,name:'New candle recipe',type:'Container',layers:[{id:crypto.randomUUID(),name:'Base layer',waxId:'',fragrancePct:0,dyePct:0,mode:'wax',weightG:200,fillPct:30,visualColour:'#ead8b5'}],decorations:[],packaging:[],lossPct:0,pricing:{...defaultPricing},notes:'',draft:true,placement:{verified:false,headspace:false,wickClearance:false,fit:false,notes:''}}}

export function calculate(state:ManufacturingState,recipe:Recipe,count=1,options:{skipMaximum?:boolean;purpose?:'test'|'sale';componentProduction?:boolean}={}):Plan {
 const issues:Issue[]=[],required=new Map<string,bigint>(),layerResults:LayerResult[]=[],figureResults:FigureResult[]=[];
 const addIssue=(level:'red'|'amber',code:string,message:string,component?:string,suggestions?:Issue['suggestions'])=>{if(!issues.some(i=>i.code===code&&i.component===component&&i.message===message))issues.push({level,code,message,component,suggestions})};
 const material=(id:string|undefined)=>state.materials.find(m=>m.id===id);
 const specified=(m:Material|undefined)=>Boolean(m?.specification.verified&&m.specification.source&&m.specification.verifiedAt);
 const loss=SCALE+divide(fixed(recipe.lossPct),fixed(100));
 function add(id:string|undefined,quantityG:number,unit:'g'|'ml'|'pcs',component:string){
  if(quantityG<=0)return;
  if(!id){if(quantityG>0)addIssue('red','missing_ingredient',`Select the required material for ${component}.`,component);return}
  const m=material(id),item=state.workspace.items.find(i=>i.id===id);
  if(!item||!m){addIssue('red','missing_material',`Material is no longer available in Inventory.`,component);return}
  if(m.kind==='equipment'){addIssue('red','reusable_equipment','Reusable equipment cannot be consumed as an ingredient.',component);return}
  let quantity=fixed(quantityG);
  if(item.unit!==unit){
   if(unit==='g'&&item.unit==='ml'&&specified(m)&&m.specification.densityGml)quantity=divide(quantity,fixed(m.specification.densityGml));
   else {addIssue('red','unit_conversion',`A verified density or correct base unit is required for ${item.name} (${item.unit}).`,component);return}
  }
  required.set(id,(required.get(id)||0n)+quantity);
 }
 function validateFormulation(f:Formulation,mixture:ReturnType<typeof mix>,component:string,intendedType=recipe.type){
  const wax=material(f.waxId),fragrance=material(f.fragranceId),dye=material(f.dyeId);
  if(!wax||wax.kind!=='wax')addIssue('red','wax_required','Select a wax from Inventory.',component);
  for(const m of [wax,fragrance,dye].filter(Boolean) as Material[]){
   const spec=m.specification;
   if(!specified(m)){addIssue('amber','unverified',`${m.name}: Specification Not Verified.`,component);continue}
   if(m.kind==='wax'){
    if(!spec.candleTypes?.length)addIssue('amber','wax_use_unknown',`${m.name}: intended candle use is not verified.`,component);
    else if(!spec.candleTypes.includes(intendedType))addIssue('red','wax_use',`${m.name} is not verified for ${intendedType}.`,component);
   }
   if(m.kind==='dye'||m.kind==='fragrance'){
    if(!spec.compatibleWaxIds?.length)addIssue('amber','compatibility_unknown',`${m.name}: wax compatibility is not verified.`,component);
    else if(!spec.compatibleWaxIds.includes(f.waxId))addIssue('red','incompatible',`${m.name} is incompatible with the selected wax according to its saved specification.`,component);
   }
   if(spec.maxFragrancePct!==undefined){
    const actual=spec.fragranceBasis==='mixture'?(mixture.mixtureG?100*mixture.fragranceG/mixture.mixtureG:0):f.fragrancePct;
    if(actual>spec.maxFragrancePct+0.000001){
     const candidates=[spec.minFragrancePct,spec.maxFragrancePct].filter((x):x is number=>x!==undefined).map(pct=>{
      const waxPct=spec.fragranceBasis==='mixture'?100*pct/(100-pct)*(1+f.dyePct/100):pct;
      return {pct:round(waxPct),fragranceG:round(mixture.waxG*waxPct/100),savingG:round(mixture.fragranceG-mixture.waxG*waxPct/100)};
     });
     addIssue('red','fragrance_exceeded',`${component}: ${f.fragrancePct}% fragrance relative to wax exceeds ${m.name}'s verified ${spec.maxFragrancePct}% ${spec.fragranceBasis==='mixture'?'finished-mixture':'wax-weight'} limit.`,component,candidates);
    }
    if(spec.minFragrancePct!==undefined&&actual<spec.minFragrancePct&&f.fragrancePct>0)addIssue('amber','below_range',`${component}: concentration is below ${m.name}'s recorded working range.`,component);
   }
   if(m.kind==='dye'&&spec.maxDyePct!==undefined&&f.dyePct>spec.maxDyePct)addIssue('red','dye_exceeded',`${component}: dye exceeds the verified ${spec.maxDyePct}% wax-weight limit.`,component);
  }
  if(f.fragrancePct>0&&!fragrance)addIssue('red','fragrance_required','Select a fragrance for this concentration.',component);
  if(fragrance&&fragrance.kind!=='fragrance')addIssue('red','wrong_fragrance','Selected ingredient is not a fragrance oil.',component);
  if(f.dyePct>0&&!dye)addIssue('red','dye_required','Select a dye for this concentration.',component);
  if(f.dyePct>0&&(!specified(dye)||dye?.specification.maxDyePct===undefined))addIssue('amber','dye_limit_unknown','Dye usage limit: Specification Not Verified.',component);
  if(dye&&dye.kind!=='dye')addIssue('red','wrong_dye','Selected ingredient is not a dye.',component);
  if(f.fragrancePct>0&&![wax,fragrance].some(m=>specified(m)&&m?.specification.maxFragrancePct!==undefined))addIssue('amber','fragrance_limit_unknown','Applicable fragrance limit: Specification Not Verified.',component);
  for(const [key,guidance] of [['meltC','meltGuidance'],['mixC','mixGuidance'],['pourC','pourGuidance'],['cure','cure']] as const)if(!specified(wax)||!wax?.specification[key]&&!wax?.specification[guidance])addIssue('amber','guidance_unknown',`${component}: verified melting, mixing, pouring or curing guidance is incomplete.`,component);
 }
 const container=recipe.containerSnapshot||state.containers.find(c=>c.id===recipe.containerId);
 const needsContainer=['Container','Layered/Decorative Candle'].includes(recipe.type);
 if(needsContainer&&!container)addIssue('red','container_required','Select a saved container linked to Inventory.');
 if(container)add(container.itemId,count,'pcs','Containers');
 const needsWick=recipe.type!=='Wax Melt'&&!options.componentProduction;
 if(needsWick&&!recipe.wickId)addIssue('red','wick_required','Select a wick. Wax melts do not require a wick.');
 if(recipe.wickId){
  add(recipe.wickId,count,'pcs','Wicks');const wick=material(recipe.wickId);
  if(wick?.kind!=='wick')addIssue('red','wrong_wick','Selected material is not a wick.');
  if(!specified(wick)||!wick?.specification.wickMinDiameterMm||!wick.specification.wickMaxDiameterMm||!container?.insideDiameterMm)addIssue('amber','wick_unverified','Wick suitability: Specification Not Verified. Record manufacturer diameter guidance and a burn test.');
  else if(container.insideDiameterMm<wick.specification.wickMinDiameterMm||container.insideDiameterMm>wick.specification.wickMaxDiameterMm)addIssue('red','wick_mismatch','The container diameter is outside the wick’s verified working range.');
 }
 let totalFill=0,layerMass=0,usedVolume=0,volumeKnown=true;
 for(const layer of recipe.layers){
  if(!Number.isFinite(layer.weightG)||!Number.isFinite(layer.fillPct)||(layer.mode==='volume'?layer.fillPct<=0:layer.weightG<=0))addIssue('red','invalid_weight','Each layer needs a positive weight or calibrated volume fill.',layer.id);
  let weight=layer.weightG,volume:number|null=null;
  if(layer.mode==='volume'){
   totalFill+=layer.fillPct;
   if(!container?.usableMl||!container.measuredAt){addIssue('red','volume_uncalibrated','Nominal container volume is not wax weight. Record calibrated usable volume first.',layer.id);weight=0}
   else {
    volume=round(container.usableMl*layer.fillPct/100);let density=layer.mixtureDensityGml;
    if(density&&(!layer.densitySource||!layer.densityDate)){addIssue('red','density_evidence','Measured formulation density needs a source/measurement note and date.',layer.id);density=undefined}
    if(!density){const wax=material(layer.waxId);if(layer.fragrancePct===0&&layer.dyePct===0&&specified(wax))density=wax?.specification.densityGml}
    if(!density){addIssue('red','density_required','A verified density for this exact formulation is required to convert volume to mixture mass.',layer.id);weight=0}
    else weight=round(volume*density);
   }
  }
  const mixture=mix(weight,layer.fragrancePct,layer.dyePct,layer.mode==='wax'?'wax':'mixture');
  if(volume===null&&layer.mixtureDensityGml&&layer.densitySource&&layer.densityDate)volume=round(mixture.mixtureG/layer.mixtureDensityGml);
  validateFormulation(layer,mixture,layer.name);
  const production={waxG:decimal(multiply(fixed(mixture.waxG*count),loss)),fragranceG:decimal(multiply(fixed(mixture.fragranceG*count),loss)),dyeG:decimal(multiply(fixed(mixture.dyeG*count),loss))};
  add(layer.waxId,production.waxG,'g',layer.name);if(production.fragranceG)add(layer.fragranceId,production.fragranceG,'g',layer.name);if(production.dyeG)add(layer.dyeId,production.dyeG,'g',layer.name);
  layerResults.push({id:layer.id,name:layer.name,...mixture,volumeMl:volume});layerMass+=mixture.mixtureG;
  if(volume===null)volumeKnown=false;else usedVolume+=volume;
 }
 if(!recipe.layers.length)addIssue('red','layers_required','Add at least one wax layer.');
 if(totalFill>100)addIssue('red','overfill','Layer fill percentages exceed 100% of the calibrated usable volume.');
 const reserved=new Map<string,number>(),cavityDemand=new Map<string,{count:number;figures:FigureResult[]}>();let decorationMass=0,decorationVolume=0,decorationVolumeKnown=true;
 if(['Pillar','Silicone Mould','Wax Melt'].includes(recipe.type)){
  const cavity=state.cavities.find(c=>c.id===recipe.cavityId&&c.mouldId===recipe.mouldId),mould=state.moulds.find(m=>m.id===recipe.mouldId);
  if(!cavity||!mould)addIssue('red','base_mould_required','Select a saved reusable mould and the exact cavity type for this moulded product.');
  else{
   cavityDemand.set(cavity.id,{count,figures:[]});
   if(recipe.layers.length===1){const calibration=state.calibrations.filter(c=>c.cavityId===cavity.id&&c.method==='actual-wax'&&formulationKey(c.formulation)===formulationKey(recipe.layers[0])).sort((a,b)=>b.date.localeCompare(a.date))[0];
    if(!calibration?.weightG)addIssue('amber','base_calibration_unknown','Actual wax capacity for this cavity and formulation is not calibrated.');
    else if(layerMass>calibration.weightG+0.000001)addIssue('red','mould_mass_overfill','Target mixture exceeds the measured cavity weight for this exact formulation.');
   }else addIssue('amber','layered_mould_fit','A multilayer moulded composition needs recorded physical fit measurements and testing.');
  }
 }
 for(const part of recipe.decorations){
  const d=(recipe.decorationSnapshots||state.decorations).find(d=>d.id===part.decorationId&&!d.archived);
  if(!d){addIssue('red','decoration_missing','A saved decoration is missing or archived.',part.id);continue}
  const cavity=state.cavities.find(c=>c.id===d.cavityId),mould=state.moulds.find(m=>m.id===cavity?.mouldId),weight=calibratedWeight(state,d);
  const needed=part.quantity*count,available=Math.max(0,decorationStock(state,d.id,d.revision)-(reserved.get(d.id)||0));
  const premade=part.source==='new'?0:Math.min(needed,available),manufacture=part.source==='stock'?0:needed-premade;
  reserved.set(d.id,(reserved.get(d.id)||0)+premade);
  if(part.source==='stock'&&premade<needed)addIssue('red','decoration_shortfall',`${d.name}: need ${needed-premade} additional pre-made figures.`,part.id);
  if(!weight)addIssue('red','calibration_required',`${d.name}: record an actual-wax calibration for this cavity and exact formulation.`,part.id);
  const measurement=state.calibrations.find(c=>c.id===d.calibrationId);
  if(measurement?.method==='actual-wax'&&measurement.volumeMl)decorationVolume+=measurement.volumeMl*part.quantity;else decorationVolumeKnown=false;
  if(!cavity||!mould)addIssue('red','mould_missing',`${d.name}: the associated mould or cavity is missing.`,part.id);
  if(mould?.compatibleWaxIds?.length&&mould.compatibilitySource&&!mould.compatibleWaxIds.includes(d.formulation.waxId))addIssue('red','mould_wax_incompatible',`${d.name}: wax is outside the mould’s verified compatibility.`,part.id);
  if(!mould?.compatibilitySource)addIssue('amber','mould_compatibility_unknown',`${d.name}: mould/wax compatibility is not verified.`,part.id);
  let newCost:number|null=0;
  if(weight){
   decorationMass+=weight*part.quantity;const mixture=mix(weight,d.formulation.fragrancePct,d.formulation.dyePct,'mixture');
   // Decorations are pillar/mould components, independently validated.
   validateFormulation(d.formulation,mixture,d.name,'Silicone Mould');
   for(const [id,g] of [[d.formulation.waxId,mixture.waxG],[d.formulation.fragranceId,mixture.fragranceG],[d.formulation.dyeId,mixture.dyeG]] as [string|undefined,number][]){
    if(g<=0)continue;add(id,decimal(multiply(fixed(g*manufacture),loss)),'g',d.name);
    const m=material(id),unit=receiptCost(state.workspace,id||'',recipe.pricing.recoverInputVat&&recipe.pricing.vatRegistered,recipe.pricing.costMode||'replacement',state.purchaseCosting);
    if(unit===null)newCost=null;else if(newCost!==null)newCost+=g*unit/(m?.unit==='ml'?(m.specification.densityGml||1):1);
   }
  }
  const stockCost=recipe.pricing.costMode==='historical'?decorationCost(state,d.id,d.revision):newCost===null?null:round(newCost*(1+recipe.lossPct/100));if(premade&&stockCost===null)addIssue('amber','decoration_cost_unknown',`${d.name}: pre-made unit cost is not available.`,part.id);
  const figure:FigureResult={decorationId:d.id,name:d.name,required:needed,premade,manufacture,weightG:weight,cost:newCost===null||premade&&stockCost===null?null:round((newCost||0)*manufacture+(stockCost||0)*premade),mouldId:mould?.id||'',cavityId:cavity?.id||'',rounds:0,finalCavities:0,avoidedOverproductionG:0};
  figureResults.push(figure);if(manufacture&&cavity){const value=cavityDemand.get(cavity.id)||{count:0,figures:[]};value.count+=manufacture;value.figures.push(figure);cavityDemand.set(cavity.id,value)}
 }
 const mouldRounds=new Map<string,number>();
 for(const [id,demand] of cavityDemand){const cavity=state.cavities.find(c=>c.id===id)!,mould=state.moulds.find(m=>m.id===cavity.mouldId);const capacity=cavity.count*(mould?.quantity||1),rounds=Math.ceil(demand.count/capacity),last=demand.count-(rounds-1)*capacity;
  for(const f of demand.figures){f.rounds=rounds;f.finalCavities=last;if(demand.figures.length===1&&f.weightG)f.avoidedOverproductionG=round((rounds*capacity-demand.count)*f.weightG)}mouldRounds.set(cavity.mouldId,Math.max(mouldRounds.get(cavity.mouldId)||0,rounds));
 }
 if(recipe.decorations.length){
  addIssue('amber','decorative_behaviour','Decorations can change melting, flame behaviour, wick performance and container temperature. The preview is illustrative; validate physical fit and burn-test this exact design.');
  if(!recipe.placement.verified||!recipe.placement.fit||!recipe.placement.headspace||!recipe.placement.wickClearance)addIssue('amber','placement_unverified','Decoration fit, remaining headspace and wick clearance have not all been measured and recorded.');
  if(!decorationVolumeKnown&&(!recipe.placement.verified||!recipe.placement.fit||!recipe.placement.headspace)){
   addIssue('amber','displacement_unverified','Decoration displacement is not inferred from weight. Record physical fill/headspace observations for this assembled design.');
  }
 }
 if(volumeKnown&&container?.usableMl&&usedVolume+(decorationVolumeKnown?decorationVolume:0)>container.usableMl+0.000001)addIssue('red','volume_overflow','Calculated layers and measured figure displacement exceed the container’s calibrated usable fill.');
 if(needsContainer&&!volumeKnown&&(!recipe.placement.verified||!recipe.placement.headspace||!recipe.placement.fit))addIssue('amber','fill_fit_unverified','Mass alone cannot establish container fill or headspace. Record formulation density or measured physical fill observations.');
 for(const p of recipe.packaging)add(p.itemId,round(p.quantity*count),material(p.itemId)?.unit||'pcs','Packaging');
 const requirements:Requirement[]=[];let materialCost:number|null=0;
 for(const [id,q] of required){const item=state.workspace.items.find(i=>i.id===id)!,quantity=decimal(q),available=stock(state.workspace,id),shortfall=round(Math.max(0,quantity-available)),unit=receiptCost(state.workspace,id,recipe.pricing.vatRegistered&&recipe.pricing.recoverInputVat,recipe.pricing.costMode||'replacement',state.purchaseCosting),cost=unit===null?null:round(unit*quantity);
  if(shortfall>0)addIssue('red','stock_shortfall',`${item.name}: need another ${shortfall} ${item.unit}.`,id);
  if(cost===null){materialCost=null;addIssue('amber','cost_unknown',`${item.name}: no usable purchase cost is recorded.`,id)}else if(materialCost!==null)materialCost+=cost;
  requirements.push({itemId:id,name:item.name,unit:item.unit,quantity,available,shortfall,remaining:round(available-quantity),unitCost:unit,cost,category:material(id)?.kind||'other'});
 }
 for(const f of figureResults){if(f.premade){const d=(recipe.decorationSnapshots||state.decorations).find(d=>d.id===f.decorationId);const unit=recipe.pricing.costMode==='historical'?decorationCost(state,f.decorationId,d?.revision):d?estimateDecorationReplacement(state,d,recipe):null;if(unit===null)materialCost=null;else if(materialCost!==null)materialCost+=unit*f.premade}}
 const latestQuality=(kind:string)=>[...state.quality].reverse().filter(q=>q.recipeId===recipe.id&&q.recipeVersion===recipe.version&&q.kind===kind).sort((a,b)=>b.date.localeCompare(a.date)||(b.sequence||0)-(a.sequence||0))[0];
 const burn=latestQuality('burn'),compliance=latestQuality('compliance');
 if(burn?.outcome!=='pass')addIssue('amber','burn_test_required','No successful burn test is recorded for this recipe version.');
 if(compliance?.outcome!=='pass')addIssue('amber','compliance_review_required','Finished mixture classification and applicable SDS/CLP documentation require review; percentages alone do not establish compliance.');
 if(options.purpose==='sale'&&(burn?.outcome!=='pass'||compliance?.outcome!=='pass'||issues.some(i=>i.level==='amber'&&!['decorative_behaviour','cost_unknown'].includes(i.code))))addIssue('red','approval_required','Production for sale requires this version’s successful burn test, documented compliance review and verified material/placement parameters.');
 const p=recipe.pricing,labour=round(p.labour*count),overhead=round(p.overhead*count),other=round(p.other*count),total=materialCost===null?null:round(materialCost+labour+overhead+other),unit=total===null?null:round(total/count);
 const vat=p.vatRegistered?1+p.outputVatPct/100:1,fees=p.feePct/100,baseFactor=1/vat-fees;
 const targetDenominator=p.strategy==='margin'?baseFactor-p.marginPct/100:baseFactor;
 if(baseFactor<=0||targetDenominator<=0)addIssue('red','pricing_invalid','Fees, VAT and target margin leave no viable selling-price denominator.');
 const breakEven=unit!==null&&baseFactor>0?round((unit+p.fixedFee)/baseFactor,2):null;
 const suggested=unit!==null&&targetDenominator>0?round((p.strategy==='markup'?unit*(1+p.markupPct/100)+p.fixedFee:unit+p.fixedFee)/targetDenominator,2):null;
 const sale=p.sellingPrice??suggested,profit=unit!==null&&sale!==null?round(sale/vat-sale*fees-p.fixedFee-unit,2):null;
 let maxCandles=count;
 if(!options.skipMaximum){let low=0,high=required.size?100000:0;while(low<high){const mid=Math.ceil((low+high+1)/2),plan=calculate(state,recipe,mid,{...options,skipMaximum:true});if(plan.issues.some(i=>i.code==='stock_shortfall'||i.code==='decoration_shortfall'))high=mid-1;else low=mid}maxCandles=low}
 const status=issues.some(i=>i.level==='red')?'red':issues.length?'amber':'green';
 return {count,layers:layerResults,requirements,figures:figureResults,issues,status,massG:round((layerMass+decorationMass)*count),mixtureG:round(layerMass*count),volumeMl:volumeKnown?round(usedVolume*count):null,finishedProductG:container?.emptyWeightG!==undefined?round((layerMass+decorationMass+container.emptyWeightG)*count):null,maxCandles,costs:{materials:materialCost===null?null:round(materialCost),labour,overhead,other,total,unit,suggested,breakEven,expectedProfit:profit,marginPct:profit!==null&&sale?round(100*profit/sale,2):null,valuation:p.costMode==='historical'?'Actual historical receipts, with recorded discounts.':'Standard replacement cost: original line values, allocated shipping and non-recoverable VAT; discounts ignored.'},canConfirm:status!=='red',burnApproved:burn?.outcome==='pass',complianceReviewed:compliance?.outcome==='pass',mouldRounds:[...mouldRounds].map(([mouldId,rounds])=>({mouldId,name:state.moulds.find(m=>m.id===mouldId)?.name||'',rounds}))};
}

import { seed, type DB } from './logic';
import { calculate, calibratedWeight, decorationStock, decorationCost, defaultPricing, formulationKey, initialRecipe, mix, receiptCost, round, stock,
 type ManufacturingState, type Material, type Recipe, type Formulation, type Specification, type Production, type Plan, type Decoration, candleTypes } from './manufacturing-model';

type Env={DB:any};type User={id:string;role:string};
class ManufacturingError extends Error {constructor(message:string,public status=400){super(message)}}
const reject=(message:string,status=400):never=>{throw new ManufacturingError(message,status)};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const uuid=()=>crypto.randomUUID();
const text=(value:unknown,label:string,max=4000,required=false)=>{if(typeof value!=='string'||value.length>max||required&&!value.trim())return reject(`Invalid ${label}`);return value.trim()};
function number(value:unknown,label:string,min=0,max=1e9,integer=false):number {if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||integer&&!Number.isInteger(value)||Math.abs(value-round(value))>1e-8)return reject(`Invalid ${label}`);return value}
const optionalNumber=(v:unknown,label:string,min=0,max=1e9)=>v===undefined||v===''?undefined:number(v,label,min,max);
function url(value:unknown,label:string){if(!value)return undefined;const result=text(value,label,2048);try{const u=new URL(result);if(u.protocol!=='https:'||u.username||u.password)throw Error();return u.toString()}catch{return reject(`${label} must be a public HTTPS URL`)}}
function photo(value:unknown){if(!value)return undefined;const s=text(value,'photo',2048);if(/^\/api\/manufacturing\/images\/[a-f0-9-]+$/.test(s))return s;return url(s,'Photo URL')}
const date=(value:unknown,label='measurement date')=>{const s=text(value,label,32,true);if(!/^\d{4}-\d{2}-\d{2}/.test(s)||Number.isNaN(Date.parse(s))||Date.parse(s)>Date.now()+86400000)return reject(`Invalid ${label}`);return s};
function object(value:unknown,label:string):any{if(!value||typeof value!=='object'||Array.isArray(value))return reject(`Invalid ${label}`);return value}
function array(value:unknown,label:string):any[]{if(!Array.isArray(value)||value.length>5000)return reject(`Invalid ${label}`);return value}
function identifier(value:unknown,label='identifier'){return text(value,label,150,true)}
function form(value:unknown,allowEmpty=false):Formulation{
 const f=object(value,'formulation');return {waxId:allowEmpty&&!f.waxId?'':identifier(f.waxId,'wax'),fragranceId:f.fragranceId?identifier(f.fragranceId):undefined,fragrancePct:number(f.fragrancePct,'fragrance percentage',0,10000),dyeId:f.dyeId?identifier(f.dyeId):undefined,dyePct:number(f.dyePct,'dye percentage',0,100),colour:f.colour?text(f.colour,'colour',100):undefined};
}
function validateSpecs(value:unknown):Specification{
 const s=object(value,'specification'),out:Specification={verified:s.verified===true};
 for(const key of ['source','supplier','productRef','lot','cure','wickNotes','notes'] as const)if(s[key])out[key]=text(s[key],key,key==='notes'?4000:1000);
 for(const key of ['sds','clp','fragranceDocumentation'] as const)if(s[key])out[key]=url(s[key],key);
 if(s.verifiedAt)out.verifiedAt=date(s.verifiedAt);
 if(out.verified&&(!out.source||!out.verifiedAt))return reject('Verified specifications require a source or measurement reference and verification date.');
 for(const key of ['minFragrancePct','maxFragrancePct','maxDyePct','densityGml','wickMinDiameterMm','wickMaxDiameterMm'] as const)if(s[key]!==undefined)out[key]=number(s[key],key,key==='densityGml'?0.000001:0,10000);
 for(const key of ['meltC','mixC','pourC'] as const)if(s[key]!==undefined)out[key]=number(s[key],key,-100,1000);
 if(out.minFragrancePct!==undefined&&out.maxFragrancePct!==undefined&&out.minFragrancePct>out.maxFragrancePct)return reject('Minimum fragrance percentage exceeds maximum.');
 if(s.fragranceBasis!==undefined&&!['wax','mixture'].includes(s.fragranceBasis))return reject('Choose the fragrance limit basis.');
 out.fragranceBasis=s.fragranceBasis||'wax';
 if(out.fragranceBasis==='mixture'&&((out.maxFragrancePct??0)>=100||(out.minFragrancePct??0)>=100))return reject('Finished-mixture percentage limits must be below 100%.');
 if(out.wickMinDiameterMm!==undefined&&out.wickMaxDiameterMm!==undefined&&out.wickMinDiameterMm>out.wickMaxDiameterMm)return reject('Minimum wick diameter exceeds the maximum.');
 if(s.candleTypes)out.candleTypes=array(s.candleTypes,'intended candle uses').map(t=>{if(!candleTypes.includes(t))return reject('Unknown candle type');return t});
 if(s.compatibleWaxIds)out.compatibleWaxIds=array(s.compatibleWaxIds,'compatible waxes').map(x=>identifier(x));
 return out;
}
export function validateRecipe(value:unknown):Recipe{
 const r=object(value,'recipe');if(!candleTypes.includes(r.type))return reject('Unknown candle type');
 const p={...defaultPricing,...object(r.pricing||{},'pricing')},placement=object(r.placement||{},'physical placement');
 for(const key of ['labour','overhead','other','fixedFee'] as const)p[key]=number(p[key],key,0,1e6);
 for(const key of ['feePct','marginPct'] as const)p[key]=number(p[key],key,0,99.999999);
 p.markupPct=number(p.markupPct,'markup',0,10000);p.outputVatPct=number(p.outputVatPct,'output VAT',0,100);
 p.vatRegistered=p.vatRegistered===true;p.recoverInputVat=p.vatRegistered&&p.recoverInputVat===true;
 if(!['margin','markup'].includes(p.strategy))return reject('Unknown pricing strategy');
 if(p.sellingPrice!==undefined)p.sellingPrice=number(p.sellingPrice,'selling price',0,1e6);
 const recipe:Recipe={id:identifier(r.id),version:number(r.version??0,'recipe version',0,1e6,true),name:text(r.name,'recipe name',200,true),type:r.type,
  containerId:r.containerId?identifier(r.containerId):undefined,mouldId:r.mouldId?identifier(r.mouldId):undefined,cavityId:r.cavityId?identifier(r.cavityId):undefined,wickId:r.wickId?identifier(r.wickId):undefined,
  layers:array(r.layers,'layers').map((l:any)=>({...form(l,r.draft===true),id:identifier(l.id),name:text(l.name,'layer name',100,true),mode:['wax','mixture','volume'].includes(l.mode)?l.mode:reject('Unknown weight mode'),weightG:number(l.weightG,'layer weight',0,1e6),fillPct:number(l.fillPct,'layer fill',0,100),mixtureDensityGml:optionalNumber(l.mixtureDensityGml,'formulation density',0.000001,100),densitySource:l.densitySource?text(l.densitySource,'density measurement reference',1000):undefined,densityDate:l.densityDate?date(l.densityDate):undefined,visualColour:/^#[a-f0-9]{6}$/i.test(l.visualColour)?l.visualColour:'#ead8b5'})),
  decorations:array(r.decorations,'decorations').map((d:any)=>({id:identifier(d.id),decorationId:identifier(d.decorationId),quantity:number(d.quantity,'decoration quantity',1,1e6,true),source:['stock','new','mixed'].includes(d.source)?d.source:reject('Invalid figure stock source')})),
  packaging:array(r.packaging||[],'packaging').map((x:any)=>({id:identifier(x.id),itemId:identifier(x.itemId),quantity:number(x.quantity,'packaging quantity',0.000001,1e6)})),
  lossPct:number(r.lossPct,'loss allowance',0,100),pricing:p,notes:text(r.notes||'','recipe notes',10000),draft:r.draft===true,
  placement:{verified:placement.verified===true,headspace:placement.headspace===true,wickClearance:placement.wickClearance===true,fit:placement.fit===true,notes:text(placement.notes||'','placement notes',4000)}};
 const ids=[...recipe.layers,...recipe.decorations,...recipe.packaging].map(x=>x.id);if(new Set(ids).size!==ids.length)return reject('Component identifiers must be unique.');
 if(recipe.placement.verified&&!recipe.placement.notes)return reject('Measured placement verification requires notes.');
 return recipe;
}
const category=(category:string):Material['kind']=>({Wax:'wax',Fragrance:'fragrance',Colour:'dye',Wicks:'wick',Containers:'container',Packaging:'packaging',Equipment:'equipment'} as Record<string,Material['kind']>)[category]||'other';
export async function loadManufacturing(env:Env):Promise<ManufacturingState>{
 const work=await env.DB.prepare('SELECT data,revision FROM workspace WHERE id=1').first();
 const workspace:DB=work?JSON.parse(work.data):seed();
 let rows:any[];
 try{rows=await env.DB.prepare('SELECT * FROM mf_materials').all().then((r:any)=>r.results||[])}catch{return reject('Manufacturing setup required: apply additive migration 0003.',503)}
 const materials:Material[]=workspace.items.map(i=>{const row=rows.find(r=>r.id===i.id);return {id:i.id,name:i.name,unit:i.unit,kind:row?.kind||category(i.category),specification:row?JSON.parse(row.specification):{},revision:row?.revision||0}});
 const read=async(table:string)=>await env.DB.prepare(`SELECT ${table==='mf_quality'?'rowid AS sequence,':''}* FROM ${table}`).all().then((r:any)=>r.results||[]);
 const [containers,moulds,cavities,calibrations,decorations,recipes,quality,movements,production,plans]=await Promise.all(['mf_containers','mf_moulds','mf_cavities','mf_calibrations','mf_decorations','mf_recipes','mf_quality','mf_decoration_movements','mf_production','mf_plans'].map(read));
 return {workspace,workspaceRevision:work?.revision??0,materials,
  containers:containers.map((r:any)=>({...JSON.parse(r.data),id:r.id,itemId:r.item_id,name:r.name,revision:r.revision})),
  moulds:moulds.map((r:any)=>({...JSON.parse(r.data),id:r.id,name:r.name,revision:r.revision})),
  cavities:cavities.map((r:any)=>({...JSON.parse(r.data),id:r.id,mouldId:r.mould_id,name:r.name,count:r.count,revision:r.revision})),
  calibrations:calibrations.map((r:any)=>({...JSON.parse(r.measured),id:r.id,cavityId:r.cavity_id,waxId:r.wax_id,formulation:JSON.parse(r.formulation),method:r.method,date:r.recorded_at})),
  decorations:decorations.map((r:any)=>({...JSON.parse(r.data),id:r.id,name:r.name,cavityId:r.cavity_id,calibrationId:r.calibration_id,revision:r.revision,archived:Boolean(r.archived)})),
  recipes:recipes.map((r:any)=>({...JSON.parse(r.data),id:r.id,version:r.version,name:r.name,type:r.type,archived:Boolean(r.archived)})),
  quality:quality.map((r:any)=>({...JSON.parse(r.data),id:r.id,sequence:r.sequence,recipeId:r.recipe_id,recipeVersion:r.recipe_version,productionId:r.production_id,kind:r.kind,outcome:r.outcome,date:r.recorded_at})),
  decorationMovements:movements.map((r:any)=>({id:r.id,decorationId:r.decoration_id,decorationRevision:r.decoration_revision,productionId:r.production_id,quantity:r.quantity,unitCost:Number(r.unit_cost),notes:r.notes})),
  plans:plans.map((r:any)=>({...JSON.parse(r.data),id:r.id,name:r.name,revision:r.revision})),
  production:production.map((r:any)=>({id:r.id,batchNumber:r.batch_number,kind:r.kind,quantity:r.quantity,recipeId:r.recipe_id,recipeVersion:r.recipe_version,decorationId:r.decoration_id,snapshot:JSON.parse(r.snapshot),date:r.produced_at,reverses:r.reverses}))};
}
function syncMaterials(env:Env,state:ManufacturingState){return state.materials.map(m=>env.DB.prepare('INSERT INTO mf_materials(id,name,unit,kind) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,unit=excluded.unit').bind(m.id,m.name,m.unit,m.kind))}
async function writeVersioned(env:Env,table:string,id:string,expected:number,insertCols:string[],insertValues:any[],updates:string[],bindings:any[]){
 const exists=await env.DB.prepare(`SELECT revision FROM ${table} WHERE id=?`).bind(id).first();
 if(exists){if(exists.revision!==expected)return reject('This record changed; reload before saving.',409);const result=await env.DB.prepare(`UPDATE ${table} SET ${updates.join(',')},revision=revision+1 WHERE id=? AND revision=?`).bind(...bindings,id,expected).run();if(!result.meta.changes)return reject('This record changed; reload.',409)}
 else{if(expected!==0)return reject('This record no longer exists.',409);await env.DB.prepare(`INSERT INTO ${table}(id,${insertCols.join(',')}) VALUES(${new Array(insertValues.length+1).fill('?').join(',')})`).bind(id,...insertValues).run()}
}
function ensureReferences(state:ManufacturingState,recipe:Recipe){
 for(const layer of recipe.layers){if(!(recipe.draft&&!layer.waxId)&&!state.materials.some(m=>m.id===layer.waxId))return reject('Choose an Inventory wax for each layer.');for(const id of [layer.fragranceId,layer.dyeId])if(id&&!state.materials.some(m=>m.id===id))return reject('An ingredient is missing from Inventory.');}
 for(const d of recipe.decorations)if(!state.decorations.some(x=>x.id===d.decorationId))return reject('A decoration no longer exists.');
 if(recipe.containerId&&!state.containers.some(c=>c.id===recipe.containerId))return reject('Container no longer exists.');
}
async function saveEntity(env:Env,state:ManufacturingState,user:User,kind:string,b:any){
 const id=b.id?identifier(b.id):uuid(),revision=number(b.revision??0,'record revision',0,1e9,true);
 await env.DB.batch(syncMaterials(env,state));
 if(kind==='materials'){
  const material=state.materials.find(m=>m.id===id);if(!material)return reject('Material not found',404);
  if(!['wax','fragrance','dye','wick','container','packaging','equipment','other'].includes(b.kind))return reject('Choose the material type.');
  const spec=validateSpecs(b.specification);
  const actual=await env.DB.prepare('SELECT revision FROM mf_materials WHERE id=?').bind(id).first();
  if(revision!==material.revision)return reject('Material specification changed; reload.',409);
  const result=await env.DB.prepare('UPDATE mf_materials SET kind=?,specification=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(b.kind,JSON.stringify(spec),id,actual.revision).run();if(!result.meta.changes)return reject('Material changed; reload.',409);
 }else if(kind==='containers'){
  const itemId=identifier(b.itemId);if(!state.materials.some(m=>m.id===itemId&&m.unit==='pcs'&&m.kind==='container'))return reject('Link a container item measured in pieces from Inventory.');
  const data={itemId,name:text(b.name,'container name',200,true),nominalMl:optionalNumber(b.nominalMl,'nominal volume',0.000001,1e6),usableMl:optionalNumber(b.usableMl,'usable measured volume',0.000001,1e6),measuredAt:b.measuredAt?date(b.measuredAt):undefined,measurementNotes:text(b.measurementNotes||'','container measurement notes',4000),insideDiameterMm:optionalNumber(b.insideDiameterMm,'inside diameter',0.000001,10000),usableHeightMm:optionalNumber(b.usableHeightMm,'usable height',0.000001,10000),emptyWeightG:optionalNumber(b.emptyWeightG,'empty container weight')};
  if(data.usableMl&&!data.measuredAt)return reject('Measured usable volume requires a measurement date.');
  await writeVersioned(env,'mf_containers',id,revision,['item_id','name','data'],[itemId,data.name,JSON.stringify(data)],['item_id=?','name=?','data=?'],[itemId,data.name,JSON.stringify(data)]);
 }else if(kind==='moulds'){
  const data={name:text(b.name,'mould name',200,true),brand:text(b.brand||'','brand',200),supplier:text(b.supplier||'','supplier',200),productUrl:url(b.productUrl,'supplier product URL'),image:photo(b.image),purchasePrice:optionalNumber(b.purchasePrice,'purchase price'),material:text(b.material||'','material',500),heatResistance:text(b.heatResistance||'','heat resistance',500),dimensions:text(b.dimensions||'','dimensions',1000),quantity:number(b.quantity??1,'available mould count',1,1e6,true),notes:text(b.notes||'','production notes',10000),compatibleWaxIds:array(b.compatibleWaxIds||[],'wax compatibility').map(x=>identifier(x)),compatibilitySource:text(b.compatibilitySource||'','compatibility source',1000)};
  await writeVersioned(env,'mf_moulds',id,revision,['name','data'],[data.name,JSON.stringify(data)],['name=?','data=?'],[data.name,JSON.stringify(data)]);
 }else if(kind==='cavities'){
  const mouldId=identifier(b.mouldId);if(!state.moulds.some(m=>m.id===mouldId))return reject('Choose a saved mould.');
  const name=text(b.name,'cavity or shape name',200,true),count=number(b.count,'number of this cavity type',1,1e6,true),data={dimensions:text(b.dimensions||'','cavity dimensions',1000),capacityMl:optionalNumber(b.capacityMl,'measured cavity capacity',0.000001,1e6),shape:text(b.shape||'','shape',200)};
  await writeVersioned(env,'mf_cavities',id,revision,['mould_id','name','count','data'],[mouldId,name,count,JSON.stringify(data)],['mould_id=?','name=?','count=?','data=?'],[mouldId,name,count,JSON.stringify(data)]);
 }else if(kind==='calibrations'){
  const cavityId=identifier(b.cavityId);if(!state.cavities.some(c=>c.id===cavityId))return reject('Choose a saved cavity.');
  if(!['water-volume','water-mass','actual-wax'].includes(b.method))return reject('Choose a calibration method.');
  const formulation=form(b.formulation),measured={notes:text(b.notes||'','calibration notes',4000),weightG:optionalNumber(b.weightG,'measured finished figure weight',0.000001),volumeMl:optionalNumber(b.volumeMl,'measured volume',0.000001),waterMassG:optionalNumber(b.waterMassG,'measured water mass',0.000001),waterDensityGml:optionalNumber(b.waterDensityGml,'measured water density',0.000001,100)};
  if(b.method==='actual-wax'&&!measured.weightG)return reject('Enter the solidified figure weight.');
  if(b.method==='water-volume'&&!measured.volumeMl)return reject('Enter the measured water volume.');
  if(b.method==='water-mass'&&(!measured.waterMassG||!measured.waterDensityGml))return reject('Water mass conversion requires the recorded water density at the measurement conditions.');
  await env.DB.prepare('INSERT INTO mf_calibrations(id,cavity_id,wax_id,formulation,method,measured,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,cavityId,formulation.waxId,JSON.stringify(formulation),b.method,JSON.stringify(measured),user.id,date(b.date)).run();
 }else if(kind==='decorations'){
  const cavityId=identifier(b.cavityId),formulation=form(b.formulation);if(!state.cavities.some(c=>c.id===cavityId))return reject('Choose a saved mould cavity.');
  const calibrationId=b.calibrationId?identifier(b.calibrationId):null;
  if(calibrationId&&!state.calibrations.some(c=>c.id===calibrationId&&c.cavityId===cavityId&&formulationKey(c.formulation)===formulationKey(formulation)&&c.method==='actual-wax'))return reject('Calibration must match this cavity and exact wax/fragrance/dye formulation.');
  const data={formulation,category:text(b.category||'','theme',200),image:photo(b.image),notes:text(b.notes||'','decoration notes',4000)},name=text(b.name,'variant name',200,true);
  await writeVersioned(env,'mf_decorations',id,revision,['cavity_id','calibration_id','name','data','archived'],[cavityId,calibrationId,name,JSON.stringify(data),b.archived?1:0],['cavity_id=?','calibration_id=?','name=?','data=?','archived=?'],[cavityId,calibrationId,name,JSON.stringify(data),b.archived?1:0]);
 }else if(kind==='recipes'){
  const recipe=validateRecipe({...b,id});ensureReferences(state,recipe);
  const current=state.recipes.filter(r=>r.id===id).sort((a,b)=>b.version-a.version)[0];
  if((current?.version||0)!==recipe.version)return reject('Recipe changed; reopen the latest version.',409);
  recipe.version++;
  recipe.decorationSnapshots=state.decorations.filter(d=>recipe.decorations.some(part=>part.decorationId===d.id));
  recipe.containerSnapshot=state.containers.find(c=>c.id===recipe.containerId);
  for(const layer of recipe.layers)if(layer.mode==='volume'&&!layer.mixtureDensityGml&&layer.fragrancePct===0&&layer.dyePct===0){const s=state.materials.find(m=>m.id===layer.waxId)?.specification;if(s?.verified&&s.densityGml&&s.source&&s.verifiedAt){layer.mixtureDensityGml=s.densityGml;layer.densitySource=s.source;layer.densityDate=s.verifiedAt}}
  const plan=calculate(state,recipe,1,{skipMaximum:true});
  if(!recipe.draft&&plan.issues.some(i=>i.level==='red'&&i.code!=='stock_shortfall'))return reject('Resolve recipe errors or save as a draft.');
  const statements=[env.DB.prepare('INSERT INTO mf_recipes(id,version,name,type,data,created_by) VALUES(?,?,?,?,?,?)').bind(id,recipe.version,recipe.name,recipe.type,JSON.stringify(recipe),user.id)];
  for(const l of recipe.layers)statements.push(env.DB.prepare('INSERT INTO mf_components(recipe_id,recipe_version,component_id,kind,material_id,data) VALUES(?,?,?,?,?,?)').bind(id,recipe.version,l.id,'layer',l.waxId||null,JSON.stringify(l)));
  for(const d of recipe.decorations)statements.push(env.DB.prepare('INSERT INTO mf_components(recipe_id,recipe_version,component_id,kind,decoration_id,data) VALUES(?,?,?,?,?,?)').bind(id,recipe.version,d.id,'decoration',d.decorationId,JSON.stringify(d)));
  for(const p of recipe.packaging)statements.push(env.DB.prepare('INSERT INTO mf_components(recipe_id,recipe_version,component_id,kind,material_id,data) VALUES(?,?,?,?,?,?)').bind(id,recipe.version,p.id,'packaging',p.itemId,JSON.stringify(p)));
  await env.DB.batch(statements);return {id,version:recipe.version};
 }else if(kind==='plans'){
  const name=text(b.name,'plan name',200,true),data={recipeId:identifier(b.recipeId),recipeVersion:number(b.recipeVersion,'recipe version',1,1e6,true),quantity:number(b.quantity,'plan quantity',1,100000,true),purpose:b.purpose==='sale'?'sale':'test',notes:text(b.notes||'','plan notes',4000)};
  if(!state.recipes.some(r=>r.id===data.recipeId&&r.version===data.recipeVersion))return reject('Save the recipe before saving a production plan.');
  await writeVersioned(env,'mf_plans',id,revision,['name','data','updated_by'],[name,JSON.stringify(data),user.id],['name=?','data=?','updated_by=?','updated_at=CURRENT_TIMESTAMP'],[name,JSON.stringify(data),user.id]);
 }else if(kind==='archive'){
  const recipe=state.recipes.find(r=>r.id===b.id&&r.version===b.version);if(!recipe)return reject('Recipe not found',404);
  await env.DB.prepare('UPDATE mf_recipes SET archived=? WHERE id=?').bind(b.archived?1:0,b.id).run();
 }else if(kind==='quality'){
  const recipe=state.recipes.find(r=>r.id===b.recipeId&&r.version===b.recipeVersion);if(!recipe)return reject('Choose an exact saved recipe version.');
  if(!['burn','compliance','inspection'].includes(b.kind)||!['pass','fail','pending'].includes(b.outcome))return reject('Invalid quality record.');
  const data={notes:text(b.notes,'test observations',10000,true),evidence:url(b.evidence,'test evidence or documentation'),batchNumber:text(b.batchNumber||'','batch number',150),classification:text(b.classification||'','finished mixture classification',4000),checks:object(b.checks||{},'test checks')};
  if(b.outcome==='pass'&&b.kind==='burn'&&[data.checks.completeBurn,data.checks.flame,data.checks.container,data.checks.decorations].some(v=>v!==true))return reject('Passing burn tests require recorded completion, flame, vessel and component observations.');
  if(b.productionId&&!state.production.some(p=>p.id===b.productionId&&p.recipeId===recipe.id&&p.recipeVersion===recipe.version))return reject('Quality record must refer to a batch of this exact recipe version.');
  if(b.outcome==='pass'&&b.kind==='compliance'&&(!data.classification||!data.evidence))return reject('Compliance review requires classification and supporting documentation; a percentage is not enough.');
  await env.DB.prepare('INSERT INTO mf_quality(id,recipe_id,recipe_version,production_id,kind,outcome,data,recorded_by,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,recipe.id,recipe.version,b.productionId||null,b.kind,b.outcome,JSON.stringify(data),user.id,date(b.date)).run();
 }else return reject('Unknown manufacturing record',404);
 return {id};
}
const stable=(value:any):string=>JSON.stringify(value,(_k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=async(value:any)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value)))),b=>b.toString(16).padStart(2,'0')).join('');
function figureRecipe(state:ManufacturingState,d:Decoration):Recipe{
 const weight=calibratedWeight(state,d);if(!weight)return reject('An actual-wax calibration is required for this decoration.');
 const r=initialRecipe();return {...r,id:`decoration:${d.id}`,name:d.name,type:'Silicone Mould',mouldId:state.cavities.find(c=>c.id===d.cavityId)?.mouldId,cavityId:d.cavityId,layers:[{...r.layers[0],...d.formulation,name:d.name,mode:'mixture',weightG:weight}],draft:false};
}
async function commitProduction(env:Env,user:User,b:any){
 const id=identifier(b.id,'idempotency key'),requestHash=await hash(b);
 const existing=await env.DB.prepare('SELECT request_hash,snapshot FROM mf_production WHERE id=?').bind(id).first();
 if(existing){if(existing.request_hash!==requestHash)return reject('Idempotency key reused for different production details.',409);return {id,replayed:true,snapshot:JSON.parse(existing.snapshot)}}
 const state=await loadManufacturing(env);if(b.workspaceRevision!==state.workspaceRevision)return reject('Inventory changed; recalculate before confirmation.',409);
 const count=number(b.quantity,'production quantity',1,100000,true),kind=b.kind==='decorations'?'decorations':'candles';
 const recipe=kind==='candles'?state.recipes.find(r=>r.id===b.recipeId&&r.version===b.recipeVersion):undefined;
 const decoration=kind==='decorations'?state.decorations.find(d=>d.id===b.decorationId&&!d.archived):undefined;
 if(kind==='candles'&&(!recipe||recipe.archived||recipe.draft))return reject('Choose a saved, active non-draft recipe version.');
 if(kind==='decorations'&&!decoration)return reject('Decoration not found',404);
 const effective=recipe||figureRecipe(state,decoration!);
 const plan=calculate(state,effective,count,{purpose:b.purpose==='sale'?'sale':'test',componentProduction:kind==='decorations'} as any);
 if(!plan.canConfirm)return reject(plan.issues.filter(i=>i.level==='red').map(i=>i.message).join(' '));
 if(plan.issues.length&&!b.acknowledgeWarnings)return reject('Review and acknowledge the recorded warnings before test production.');
 const batchNumber=text(b.batchNumber,'batch number',150,true),producedAt=date(b.date,'production date'),notes=text(b.notes||'','batch notes',4000);
 const next:DB=structuredClone(state.workspace);
 const movements=plan.requirements.map((r,i)=>({id:`mfg:${id}:${i}`,itemId:r.itemId,date:producedAt,type:'consumed' as const,quantity:-r.quantity,note:`${batchNumber}: ${effective.name}`,ref:id}));
 next.movements.push(...movements);next.batches.push({id,productId:recipe?.id||`decoration:${decoration!.id}`,date:producedAt,count,note:`Manufacturing: ${batchNumber}. ${notes}`});
 const capturedDecorations=effective.decorationSnapshots||state.decorations.filter(d=>effective.decorations.some(p=>p.decorationId===d.id));
 const snapshot={recipe:effective,plan,materialSpecifications:state.materials.filter(m=>plan.requirements.some(r=>r.itemId===m.id)),container:effective.containerSnapshot||state.containers.find(c=>c.id===effective.containerId)||null,
  decorations:capturedDecorations,calibrations:state.calibrations.filter(c=>capturedDecorations.some(d=>d.calibrationId===c.id)),notes,purpose:b.purpose||'test',warningsAcknowledged:Boolean(b.acknowledgeWarnings)};
 const statements=[...syncMaterials(env,state),env.DB.prepare('INSERT OR IGNORE INTO workspace(id,data,revision) VALUES(1,?,0)').bind(JSON.stringify(state.workspace)),
  env.DB.prepare('INSERT INTO mf_production(id,request_hash,batch_number,recipe_id,recipe_version,decoration_id,kind,quantity,expected_revision,snapshot,created_by,produced_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,requestHash,batchNumber,recipe?.id||null,recipe?.version||null,decoration?.id||null,kind,count,state.workspaceRevision,JSON.stringify(snapshot),user.id,producedAt),
  env.DB.prepare('UPDATE workspace SET data=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),user.id,state.workspaceRevision)];
 for(const m of movements){const req=plan.requirements.find(r=>r.itemId===m.itemId)!;const spec=state.materials.find(s=>s.id===m.itemId)!.specification;
  statements.push(env.DB.prepare('INSERT INTO mf_material_movements(id,material_id,production_id,quantity,unit,unit_cost,supplier_lots,notes) VALUES(?,?,?,?,?,?,?,?)').bind(m.id,m.itemId,id,String(m.quantity),req.unit,req.unitCost===null?null:String(req.unitCost),JSON.stringify({supplier:spec.supplier||null,lot:spec.lot||null,productRef:spec.productRef||null,purchases:state.workspace.purchases.filter(p=>p.lines.some(l=>l.id===m.itemId||l.name===req.name)).map(p=>({id:p.id,number:p.number,date:p.date,supplier:p.supplier}))}),notes));
 }
 const figureUnit=kind==='decorations'?(plan.costs.unit??null):null;if(kind==='decorations'&&figureUnit===null)return reject('Record actual material purchase costs before creating valued decoration stock.');
 if(decoration)statements.push(env.DB.prepare('INSERT INTO mf_decoration_movements(id,decoration_id,decoration_revision,production_id,quantity,unit_cost,notes) VALUES(?,?,?,?,?,?,?)').bind(uuid(),decoration.id,decoration.revision,id,count,String(figureUnit),'Manufactured figures'));
 for(const figure of plan.figures)if(figure.premade){const d=effective.decorationSnapshots?.find(d=>d.id===figure.decorationId)||state.decorations.find(d=>d.id===figure.decorationId)!;statements.push(env.DB.prepare('INSERT INTO mf_decoration_movements(id,decoration_id,decoration_revision,production_id,quantity,unit_cost,notes) VALUES(?,?,?,?,?,?,?)').bind(uuid(),figure.decorationId,d.revision,id,-figure.premade,String(decorationCost(state,figure.decorationId,d.revision)||0),'Consumed pre-made figures'))}
 statements.push(env.DB.prepare('INSERT INTO activity(user_id,action,revision) VALUES(?,?,?)').bind(user.id,`manufacturing.${kind}:${id}`,state.workspaceRevision+1));
 try{await env.DB.batch(statements)}catch(error){const replay=await env.DB.prepare('SELECT request_hash FROM mf_production WHERE id=?').bind(id).first();if(replay?.request_hash===requestHash)return {id,replayed:true};const message=String(error);if(/conflict|UNIQUE|insufficient_decoration_stock/.test(message))return reject('Production already exists or inventory changed. Reload and review.',409);throw error}
 return {id,workspaceRevision:state.workspaceRevision+1,plan};
}

async function productionAdjustment(env:Env,user:User,b:any,reverse=false){
 const id=identifier(b.id,'idempotency key'),requestHash=await hash(b);
 const replay=await env.DB.prepare('SELECT request_hash FROM mf_production WHERE id=?').bind(id).first();if(replay){if(replay.request_hash!==requestHash)return reject('Idempotency key reused for different adjustment.',409);return {id,replayed:true}}
 const state=await loadManufacturing(env),parent=state.production.find(p=>p.id===b.productionId&&['candles','decorations'].includes(p.kind));
 if(!parent)return reject('Original production batch not found.',404);
 if(state.production.some(p=>p.reverses===parent.id))return reject('This production batch has already been reversed.',409);
 if(b.workspaceRevision!==state.workspaceRevision)return reject('Inventory changed; reload before adjusting.',409);
 const reason=text(b.reason,'adjustment reason',4000,true),when=date(b.date,'adjustment date');
 const original=parent.snapshot.plan as Plan;
 const previous=state.production.filter(p=>p.kind==='actual'&&p.snapshot.parentId===parent.id);
 const deltas=new Map<string,number>();
 if(reverse){
  if(!b.materialsUnused)return reject('Reversal can return stock only when materials were not mixed or consumed. Otherwise record measured actual consumption and waste.');
  for(const req of original.requirements){let consumed=req.quantity;for(const p of previous)consumed+=p.snapshot.deltas.find((d:any)=>d.itemId===req.itemId)?.consumedDelta||0;deltas.set(req.itemId,-consumed)}
 }else{
  for(const input of array(b.actual,'actual consumption')){
   const itemId=identifier(input.itemId),requirement=original.requirements.find(r=>r.itemId===itemId);if(!requirement)return reject('Actual consumption must reference an original batch material.');
   if(deltas.has(itemId))return reject('A material was entered twice.');
   const actual=number(input.quantity,'actual total consumption',0,1e9);let consumed=requirement.quantity;
   for(const p of previous)consumed+=p.snapshot.deltas.find((d:any)=>d.itemId===itemId)?.consumedDelta||0;
   deltas.set(itemId,round(actual-consumed));
  }
 }
 const next:DB=structuredClone(state.workspace),snapshot={parentId:parent.id,reason,materialsUnused:Boolean(b.materialsUnused),deltas:[...deltas].map(([itemId,consumedDelta])=>({itemId,consumedDelta})),originalBatch:parent.batchNumber};
 for(const [itemId,consumedDelta] of deltas){if(stock(next,itemId)-consumedDelta<-0.000001)return reject('Not enough stock for the additional measured consumption.');if(consumedDelta)next.movements.push({id:`mfg:${id}:${itemId}`,itemId,date:when,type:'adjustment',quantity:-consumedDelta,note:`${reverse?'Reversal':'Actual consumption'}: ${parent.batchNumber}. ${reason}`,ref:id})}
 const statements=[env.DB.prepare('INSERT INTO mf_production(id,request_hash,batch_number,recipe_id,recipe_version,kind,quantity,expected_revision,snapshot,created_by,produced_at,reverses) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
  .bind(id,requestHash,text(b.batchNumber,'adjustment reference',150,true),parent.recipeId||null,parent.recipeVersion||null,reverse?'reversal':'actual',0,state.workspaceRevision,JSON.stringify(snapshot),user.id,when,reverse?parent.id:null),
  env.DB.prepare('UPDATE workspace SET data=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),user.id,state.workspaceRevision)];
 for(const [itemId,delta] of deltas)if(delta){const requirement=original.requirements.find(r=>r.itemId===itemId)!;statements.push(env.DB.prepare('INSERT INTO mf_material_movements(id,material_id,production_id,quantity,unit,unit_cost,supplier_lots,notes) VALUES(?,?,?,?,?,?,?,?)').bind(uuid(),itemId,id,String(-delta),requirement.unit,requirement.unitCost===null?null:String(requirement.unitCost),'[]',reason))}
 if(reverse){const originalFigures=state.decorationMovements.filter(m=>m.productionId===parent.id);for(const m of originalFigures)statements.push(env.DB.prepare('INSERT INTO mf_decoration_movements(id,decoration_id,decoration_revision,production_id,quantity,unit_cost,notes) VALUES(?,?,?,?,?,?,?)').bind(uuid(),m.decorationId,m.decorationRevision||1,id,-m.quantity,String(m.unitCost),`Reversal: ${reason}`))}
 statements.push(env.DB.prepare('INSERT INTO activity(user_id,action,revision) VALUES(?,?,?)').bind(user.id,`manufacturing.${reverse?'reversal':'actual'}:${id}`,state.workspaceRevision+1));
 try{await env.DB.batch(statements)}catch{return reject('Adjustment could not commit: inventory changed, figures were already used, or this reference exists. Reload and review.',409)}
 return {id,workspaceRevision:state.workspaceRevision+1};
}

export function protectManufacturingMovements(current:DB,next:DB):string|null{
 if(next.items.some(i=>!i||typeof i.id!=='string')||next.movements.some(m=>!m||typeof m.itemId!=='string'))return 'Invalid Inventory records.';
 if(next.movements.some(m=>!Number.isFinite(m.quantity)||typeof m.id!=='string'||!next.items.some(i=>i.id===m.itemId)))return 'Invalid stock movement or missing Inventory item.';
 if(new Set(next.movements.map(m=>m.id)).size!==next.movements.length||new Set(next.items.map(i=>i.id)).size!==next.items.length)return 'Inventory and movement identifiers must be unique.';
 const protectedMovements=current.movements.filter(m=>m.id.startsWith('mfg:'));
 for(const m of protectedMovements)if(!next.movements.some(n=>n.id===m.id&&stable(n)===stable(m)))return 'Production movements are immutable. Use a traceable manufacturing adjustment.';
 if(next.movements.some(m=>m.id.startsWith('mfg:')&&!protectedMovements.some(p=>p.id===m.id)))return 'Manufacturing movements must be recorded through the production API.';
 for(const item of next.items){if(!['g','ml','pcs'].includes(item.unit)||!Number.isFinite(item.opening)||!Number.isFinite(item.low))return 'Invalid Inventory base units or quantities.';if(protectedMovements.some(m=>m.itemId===item.id)&&current.items.find(i=>i.id===item.id)?.unit!==item.unit)return 'Cannot change the base unit of a material used in production.';if(stock(next,item.id)<-0.000001)return 'Inventory cannot be negative.'}
 for(const m of protectedMovements)if(!next.items.some(i=>i.id===m.itemId))return 'Cannot remove an Inventory item with production history.';
 return null;
}

const supplierHosts=new Set(['www.hobbycraft.co.uk','hobbycraft.co.uk','candle-shack.co.uk','www.candle-shack.co.uk','suppliesforcandles.co.uk','www.suppliesforcandles.co.uk']);
export function validateImportUrl(value:unknown):URL {
 const parsed=new URL(url(value,'Product URL')||reject('Enter a product URL.'));
 if(parsed.port||!supplierHosts.has(parsed.hostname)||parsed.pathname.length>1800)return reject('URL import supports Hobbycraft, Candle Shack and Supplies for Candles public HTTPS product pages. Other suppliers can be entered manually.');
 return parsed;
}
export function extractProduct(html:string,source:string){
 const nodes:any[]=[];for(const match of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi))try{const value=JSON.parse(match[1]);nodes.push(...(Array.isArray(value)?value:[value]));if(nodes.length>200)break}catch{}
 const product=nodes.flatMap(n=>[n,...(Array.isArray(n?.['@graph'])?n['@graph']:[])]).find(n=>n&&([n['@type']].flat()).includes('Product'));
 const strip=(s:any)=>typeof s==='string'?s.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim():'';
 const meta=(name:string)=>html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`,'i'))?.[1]||'';
 const name=strip(product?.name||meta('og:title')),description=strip(product?.description||meta('og:description'));
 const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers;
 const price=Number(offer?.price),image=typeof product?.image==='string'?product.image:Array.isArray(product?.image)?product.image[0]:product?.image?.url||meta('og:image');
 const properties=Array.isArray(product?.additionalProperty)?product.additionalProperty:[];
 const fact=(regex:RegExp)=>properties.find((p:any)=>regex.test(p.name||''))?.value;
 const cavities=fact(/cavit|wells/i)??description.match(/\b(\d+)\s*(?:cavities|wells)\b/i)?.[1];
 const capacityProperty=properties.find((p:any)=>/per\s*cavity|each\s*cavity/i.test(p.name||'')&&/capacity|volume/i.test(p.name||''));
 const capacityText=capacityProperty?`${capacityProperty.value} ${capacityProperty.unitText||''}`:'';
 const capacityMatch=capacityText.match(/^\s*(\d+(?:\.\d+)?)\s*ml\s*$/i),capacityMl=capacityMatch?Number(capacityMatch[1]):null;
 return {name,supplier:new URL(source).hostname,productUrl:source,purchasePrice:offer?.price!==undefined&&Number.isFinite(price)&&price>=0&&(!offer.priceCurrency||offer.priceCurrency==='GBP')?price:undefined,image:image?url(new URL(image,source).toString(),'Product image'):undefined,notes:description,dimensions:String(fact(/dimensions|size/i)||''),material:String(product?.material||fact(/^material$/i)||''),heatResistance:String(fact(/temperature|heat/i)||''),publishedCavities:cavities&&/^\d+$/.test(String(cavities))?Number(cavities):null,capacityMl,weightG:null,source,reviewRequired:true,notice:'Wax capacity is not specified by the supplier. Please enter a measured value or calibrate this mould.'};
}
async function importProduct(env:Env,user:User,value:unknown){
 const productUrl=validateImportUrl(value),window=Math.floor(Date.now()/3600000);
 const limited=await env.DB.prepare('INSERT INTO mf_import_limits(user_id,window,requests) VALUES(?,?,1) ON CONFLICT(user_id,window) DO UPDATE SET requests=requests+1 WHERE requests<10 RETURNING requests').bind(user.id,window).first();
 if(!limited)return reject('Product import limit reached. Try again later or enter the mould manually.',429);
 const response=await fetch(productUrl,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'accept':'text/html','user-agent':'CandleStudioPro-ProductMetadata/1.0'}});
 if(!response.ok||!response.headers.get('content-type')?.includes('text/html'))return reject('Supplier import is unavailable or restricted. Enter the mould manually.',422);
 if(Number(response.headers.get('content-length'))>524288)return reject('Supplier page is too large; enter the mould manually.',413);
 const reader=response.body?.getReader();if(!reader)return reject('No supplier content received.');let size=0;const parts:Uint8Array[]=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>524288){await reader.cancel();return reject('Supplier page is too large; enter the mould manually.',413)}parts.push(value)}
 const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 const result=extractProduct(new TextDecoder().decode(bytes),productUrl.toString());if(!result.name)return reject('No reliable public product metadata found. Enter the mould manually.',422);return result;
}
async function imageUpload(req:Request,env:Env,user:User){
 const mime=req.headers.get('content-type')?.split(';')[0];if(!['image/png','image/jpeg','image/webp'].includes(mime||''))return reject('Upload a PNG, JPEG or WebP image. SVG files are not accepted.');
 const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>524288||bytes.length<12)return reject('Image must be smaller than 512 KB.',413);
 if(mime==='image/png'&&![137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)||mime==='image/jpeg'&&!(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)||mime==='image/webp'&&!(String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'))return reject('Image contents do not match the selected file type.');
 const id=uuid();let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.slice(i,i+8192));
 await env.DB.prepare('INSERT INTO mf_images(id,mime,data,created_by) VALUES(?,?,?,?)').bind(id,mime,btoa(raw),user.id).run();return {url:`/api/manufacturing/images/${id}`};
}
export async function handleManufacturing(req:Request,env:Env,user:User):Promise<Response>{
 try{
  const path=new URL(req.url).pathname.split('/').filter(Boolean),action=path[2];
  if(!['admin','member'].includes(user.role))return reject('Manufacturing access denied.',403);
  if(req.method==='GET'&&action==='images'&&path[3]){const row=await env.DB.prepare('SELECT mime,data FROM mf_images WHERE id=?').bind(path[3]).first();if(!row)return json({error:'Image not found'},404);return new Response(Uint8Array.from(atob(row.data),(c:string)=>c.charCodeAt(0)),{headers:{'content-type':row.mime,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'}})}
  if(req.method==='GET'&&action==='state')return json(await loadManufacturing(env));
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  if(user.role!=='admin')return reject('An administrator must save specifications or confirm production.',403);
  if(req.headers.get('origin')!==new URL(req.url).origin)return reject('Invalid request origin.',403);
  if(action==='images')return json(await imageUpload(req,env,user));
  const raw=await req.text();if(raw.length>2_000_000)return reject('Request exceeds 2 MB.',413);
  let body:any;try{body=object(JSON.parse(raw),'request')}catch{return reject('Invalid JSON request.')}
  if(action==='import-mould')return json(await importProduct(env,user,body.url));
  if(action==='produce')return json(await commitProduction(env,user,body));
  if(action==='actual')return json(await productionAdjustment(env,user,body));
  if(action==='reverse')return json(await productionAdjustment(env,user,body,true));
  const state=await loadManufacturing(env);
  if(action==='purchase-valuation'){
   if(body.workspaceRevision!==state.workspaceRevision)return reject('Workspace changed; reload before changing valuation.',409);
   const purchase=state.workspace.purchases.find(p=>p.id===body.purchaseId);if(!purchase)return reject('Purchase not found',404);
   if(typeof body.pricesIncludeVat!=='boolean')return reject('Choose whether the recorded line prices include VAT.');
   const next=structuredClone(state.workspace);next.purchases.find(p=>p.id===purchase.id)!.pricesIncludeVat=body.pricesIncludeVat;
   const results=await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO workspace(id,data,revision) VALUES(1,?,0)').bind(JSON.stringify(state.workspace)),
    env.DB.prepare('UPDATE workspace SET data=?,revision=revision+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE id=1 AND revision=?').bind(JSON.stringify(next),user.id,state.workspaceRevision),
    env.DB.prepare('INSERT INTO activity(user_id,action,revision) SELECT ?,?,? WHERE changes()=1').bind(user.id,`purchase.valuation:${purchase.id}`,state.workspaceRevision+1)]);
   if(!results[1].meta.changes)return reject('Workspace changed; reload before changing valuation.',409);
   return json({workspaceRevision:state.workspaceRevision+1});
  }
  if(action==='calculate'){const recipe=body.recipeId?state.recipes.find(r=>r.id===body.recipeId&&r.version===body.recipeVersion):validateRecipe(body.recipe);if(!recipe)return reject('Recipe version not found.',404);return json(calculate(state,recipe,number(body.quantity,'batch quantity',1,100000,true),{purpose:body.purpose==='sale'?'sale':'test'}))}
  return json(await saveEntity(env,state,user,action,body));
 }catch(error){if(error instanceof ManufacturingError)return json({error:error.message},error.status);return json({error:'Manufacturing operation could not be completed. Reload and retry; no partial production was committed.'},503)}
}

import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {assert} from './validation.js';

const fields=['question','description','resolutionSource','endDate','startDate','eventStartTime','eventEndTime','outcomes','marketType','negRisk','active','closed','archived','acceptingOrders','conditionId','slug','cryptoMarketConfig'];
const semantic=new Set(['question','description','resolutionSource','endDate','eventStartTime','eventEndTime','outcomes','marketType','negRisk','cryptoMarketConfig']);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const idOf=value=>{const id=String(value);assert(/^\d{1,20}$/.test(id),'ID Gamma invalide');return id;};
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function readJson(path,fallback){try{return JSON.parse(await readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function readLines(path){try{const s=await readFile(path,'utf8');return s.trim()?s.trimEnd().split('\n').map(line=>JSON.parse(line)):[];}catch(e){if(e.code==='ENOENT')return [];throw e;}}
async function atomicJson(path,value){const temp=`${path}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,path);}

export function snapshot(raw,observedAt=new Date().toISOString()){
  assert(raw&&typeof raw==='object'&&!Array.isArray(raw),'Marché Gamma invalide');
  const marketId=idOf(raw.id);assert(typeof raw.question==='string'&&raw.question.trim(),'Question Gamma absente');
  const value=Object.fromEntries(fields.map(k=>[k,stable(raw[k]??null)]));
  assert(fields.every(k=>JSON.stringify(value[k]).length<=100000),'Champ Gamma trop grand');
  const contentHash=hash(value);
  return {marketId,observedAt,sourceUpdatedAt:raw.updatedAt??null,sourceUrl:`https://gamma-api.polymarket.com/markets/${marketId}`,marketUrl:`https://polymarket.com/event/${encodeURIComponent(raw.slug||'')}`,contentHash,fields:value};
}
export function compareSnapshots(before,after){
  assert(before.marketId===after.marketId,'Marchés incompatibles');
  const changes=fields.filter(field=>JSON.stringify(before.fields[field])!==JSON.stringify(after.fields[field])).map(field=>({field,kind:semantic.has(field)?'rule_or_resolution':'metadata',before:before.fields[field],after:after.fields[field]}));
  return {id:hash({marketId:after.marketId,from:before.contentHash,to:after.contentHash,observedAt:after.observedAt}),marketId:after.marketId,beforeHash:before.contentHash,afterHash:after.contentHash,firstObservedAt:after.observedAt,previousObservedAt:before.observedAt,changes};
}
export function positionImpact(change,positions){
  const affected=positions.filter(p=>p.marketId===change.marketId);
  return {count:affected.length,entryCostUsd:affected.reduce((sum,p)=>sum+p.quantity*p.entryPrice,0),positions:affected};
}
export function createMemory({directory=join(process.cwd(),'.memory'),fetcher=fetch,now=()=>new Date().toISOString()}={}){
  const configPath=join(directory,'watchlist.json'),snapshotPath=join(directory,'snapshots.jsonl'),reviewPath=join(directory,'reviews.jsonl');
  let queue=Promise.resolve(),running=false,lastRun=null,lastError=null;
  const serialize=fn=>{const run=queue.then(fn);queue=run.catch(()=>{});return run;};
  const init=async()=>{await mkdir(directory,{recursive:true,mode:0o700});return readJson(configPath,{marketIds:[],positions:[]});};
  const getSnapshots=()=>readLines(snapshotPath);
  async function view(){
    const [config,snapshots,reviews]=await Promise.all([init(),getSnapshots(),readLines(reviewPath)]);
    const history=new Map(),changes=[];
    for(const s of snapshots){const prev=history.get(s.marketId);if(prev)changes.push(compareSnapshots(prev,s));history.set(s.marketId,s);}
    const latest=[...history.values()].filter(s=>config.marketIds.includes(s.marketId));
    const reviewed=new Map(reviews.map(r=>[r.changeId,r]));
    return {marketIds:config.marketIds,positions:config.positions,latest,snapshots,changes:changes.reverse().map(c=>({...c,review:reviewed.get(c.id)||null,impact:positionImpact(c,config.positions)})),reviews,run:{running,lastRun,lastError},intervalMinutes:15,notice:'Historique observé depuis la première capture uniquement. Une différence de métadonnées ne prouve pas un changement juridique effectif des règles.'};
  }
  async function fetchMarket(id){
    const response=await fetcher(`https://gamma-api.polymarket.com/markets/${id}`,{signal:AbortSignal.timeout(12000)});
    assert(response.ok,`Gamma ${id} : HTTP ${response.status}`);
    const raw=await response.json();assert(idOf(raw.id)===id,'ID Gamma inattendu');return snapshot(raw,now());
  }
  const appendSnapshot=async s=>{const all=await getSnapshots(),previous=all.filter(x=>x.marketId===s.marketId).at(-1);if(previous?.contentHash===s.contentHash)return false;await appendFile(snapshotPath,JSON.stringify(s)+'\n',{mode:0o600});return true;};
  async function add(marketId){return serialize(async()=>{const id=idOf(marketId),config=await init();assert(config.marketIds.includes(id)||config.marketIds.length<25,'Liste limitée à 25 marchés');if(config.marketIds.includes(id))return view();const s=await fetchMarket(id);await appendSnapshot(s);config.marketIds.push(id);await atomicJson(configPath,config);return view();});}
  async function remove(marketId){return serialize(async()=>{const id=idOf(marketId),config=await init();config.marketIds=config.marketIds.filter(x=>x!==id);config.positions=config.positions.filter(x=>x.marketId!==id);await atomicJson(configPath,config);return view();});}
  async function setPosition(input){return serialize(async()=>{const id=idOf(input.marketId),config=await init();assert(config.marketIds.includes(id),'Marché absent de la liste');assert(['YES','NO'].includes(input.side),'Côté invalide');assert(Number.isFinite(input.quantity)&&input.quantity>=0&&input.quantity<=1e9,'Quantité invalide');assert(Number.isFinite(input.entryPrice)&&input.entryPrice>=0&&input.entryPrice<=1,'Prix invalide');config.positions=config.positions.filter(p=>p.marketId!==id);if(input.quantity>0)config.positions.push({marketId:id,side:input.side,quantity:input.quantity,entryPrice:input.entryPrice});await atomicJson(configPath,config);return view();});}
  async function review(input){return serialize(async()=>{assert(typeof input.changeId==='string'&&/^[a-f0-9]{64}$/.test(input.changeId),'Changement invalide');assert(['confirmed','cosmetic','uncertain'].includes(input.verdict),'Revue invalide');assert(typeof input.note==='string'&&input.note.trim().length>=10&&input.note.length<=2000,'Note de revue requise (10 à 2 000 caractères)');const state=await view();assert(state.changes.some(c=>c.id===input.changeId),'Changement introuvable');const record={id:randomUUID(),changeId:input.changeId,verdict:input.verdict,note:input.note.trim(),reviewedAt:now()};await appendFile(reviewPath,JSON.stringify(record)+'\n',{mode:0o600});return view();});}
  async function capture(){if(running)throw Error('Capture déjà en cours');running=true;try{return await serialize(async()=>{const config=await init();assert(config.marketIds.length>0,'Ajouter au moins un marché');const result={attempted:config.marketIds.length,stored:0,unchanged:0,errors:[]};for(const id of config.marketIds){try{const s=await fetchMarket(id);if(await appendSnapshot(s))result.stored++;else result.unchanged++;}catch(e){result.errors.push({marketId:id,error:e.message});}}lastRun=now();lastError=result.errors.length?`${result.errors.length} marché(s) indisponible(s)`:null;return {result,state:await view()};});}catch(e){lastError=e.message;throw e;}finally{running=false;}}
  async function getPair(changeId){const snapshots=await getSnapshots();const history=new Map();for(const s of snapshots){const previous=history.get(s.marketId);if(previous&&compareSnapshots(previous,s).id===changeId)return {before:previous,after:s};history.set(s.marketId,s);}return null;}
  return {view,add,remove,setPosition,review,capture,getPair};
}

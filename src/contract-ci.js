import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assert,text,number,time,list} from './validation.js';

const evidenceFields=['source','cutoff','threshold','corrections','unavailable'];
const decisions=['YES','NO','VOID','UNKNOWN'];
const labels={source:'Source primaire',cutoff:'Heure limite',threshold:'Seuil et comparaison',corrections:'Corrections de la source',unavailable:'Source indisponible'};
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
const validId=value=>{text(value,'draftId',80);assert(/^[a-z0-9][a-z0-9-]{0,79}$/.test(value),'ID du projet invalide');return value;};
const validUrl=value=>{text(value,'sourceUrl',500);const url=new URL(value);assert(url.protocol==='https:'&&url.hostname&&url.username===''&&url.password==='','URL HTTPS publique requise');return value;};

export function normalizeDraft(input){
  assert(input&&typeof input==='object'&&!Array.isArray(input),'Projet de contrat invalide');
  const draft={draftId:validId(input.draftId),title:text(input.title,'title',500).trim(),rulesText:text(input.rulesText,'rulesText',20000).trim(),sourceName:text(input.sourceName,'sourceName',300).trim(),sourceUrl:validUrl(input.sourceUrl),cutoffAt:input.cutoffAt,threshold:number(input.threshold,'threshold',-1e12+1,1e12-1),comparator:input.comparator,correctionPolicy:input.correctionPolicy,unavailablePolicy:input.unavailablePolicy,evidence:{},assertions:{}};
  time(draft.cutoffAt,'cutoffAt');
  assert(['gt','gte'].includes(draft.comparator),'Comparaison invalide');
  assert(['first_release','latest_by_cutoff'].includes(draft.correctionPolicy),'Politique de correction invalide');
  assert(['wait','void'].includes(draft.unavailablePolicy),'Politique de source indisponible invalide');
  for(const field of evidenceFields){const excerpt=input.evidence?.[field]??'';assert(typeof excerpt==='string'&&excerpt.length<=2000,`Extrait ${field} invalide`);draft.evidence[field]=excerpt.trim();}
  for(const scenario of ['below','equal','above','correction','lateCorrection','late','unavailable']){
    const expected=input.assertions?.[scenario]??null;
    assert(expected===null||decisions.includes(expected),`Résultat attendu ${scenario} invalide`);
    draft.assertions[scenario]=expected;
  }
  return draft;
}

export function resolveReleases(draft,releases){
  list(releases,'releases',20);
  const eligible=releases.map((release,i)=>{assert(release&&typeof release==='object',`Publication ${i} invalide`);return {publishedAt:release.publishedAt,value:number(release.value,`release.${i}.value`,-1e12,1e12)};}).filter(release=>time(release.publishedAt,'release.publishedAt')<=time(draft.cutoffAt,'cutoffAt'));
  if(!eligible.length)return {outcome:draft.unavailablePolicy==='void'?'VOID':'UNKNOWN',reason:'Aucune publication de la source à l’heure limite.',release:null};
  eligible.sort((a,b)=>Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
  const release=draft.correctionPolicy==='first_release'?eligible[0]:eligible.at(-1);
  if(eligible.some(r=>r.publishedAt===release.publishedAt&&r.value!==release.value))return {outcome:'UNKNOWN',reason:'Publications contradictoires au même horodatage.',release:null};
  return {outcome:(draft.comparator==='gt'?release.value>draft.threshold:release.value>=draft.threshold)?'YES':'NO',reason:draft.correctionPolicy==='first_release'?'Première publication admissible.':'Dernière publication admissible avant la limite.',release};
}

export function analyzeDraft(input){
  const draft=normalizeDraft(input),issues=[];
  const add=(code,severity,message)=>issues.push({code,severity,message});
  for(const field of evidenceFields){const excerpt=draft.evidence[field];if(!excerpt)add(`missing_${field}`,'blocking',`${labels[field]} : citer le passage exact des règles.`);else if(!draft.rulesText.includes(excerpt))add(`invalid_${field}`,'blocking',`${labels[field]} : l’extrait cité ne figure pas dans les règles.`);}
  if(draft.evidence.source&&(!draft.evidence.source.includes(draft.sourceName)||!draft.evidence.source.includes(draft.sourceUrl)))add('source_spec_mismatch','blocking','La citation de source doit contenir le nom et l’URL déclarés.');
  const cutoff=Date.parse(draft.cutoffAt),minute=60_000;
  const values={below:draft.threshold-1,equal:draft.threshold,above:draft.threshold+1};
  const scenarios=[
    ...Object.entries(values).map(([id,value])=>({id,label:{below:'Juste sous le seuil',equal:'Exactement au seuil',above:'Juste au-dessus du seuil'}[id],releases:[{publishedAt:new Date(cutoff-minute).toISOString(),value}]})),
    {id:'correction',label:'Correction avant la limite',releases:[{publishedAt:new Date(cutoff-2*minute).toISOString(),value:draft.threshold-1},{publishedAt:new Date(cutoff-minute).toISOString(),value:draft.threshold+1}]},
    {id:'lateCorrection',label:'Correction après la limite',releases:[{publishedAt:new Date(cutoff-minute).toISOString(),value:draft.threshold-1},{publishedAt:new Date(cutoff+minute).toISOString(),value:draft.threshold+1}]},
    {id:'late',label:'Première publication après la limite',releases:[{publishedAt:new Date(cutoff+minute).toISOString(),value:draft.threshold+1}]},
    {id:'unavailable',label:'Aucune publication',releases:[]}
  ].map(s=>{const result=resolveReleases(draft,s.releases),expected=draft.assertions[s.id];return {...s,...result,expected,status:expected===null?'unreviewed':expected===result.outcome?'pass':'fail'};});
  for(const s of scenarios){if(s.status==='unreviewed')add(`unreviewed_${s.id}`,'blocking',`${s.label} : résultat attendu à renseigner et à relire.`);if(s.status==='fail')add(`failed_${s.id}`,'blocking',`${s.label} : attendu ${s.expected}, calculé ${s.outcome}.`);}
  const contentHash=hash(draft);
  return {draft,contentHash,scenarios,issues,readyForReview:issues.every(i=>i.severity!=='blocking'),notice:'Ce contrôle vérifie les champs, les extraits cités et le moteur numérique. Il ne prouve pas que la normalisation reflète les règles ni qu’une source a publié ces valeurs.'};
}

async function readLines(path){try{const content=await readFile(path,'utf8');return content.trim()?content.trimEnd().split('\n').map(line=>JSON.parse(line)):[];}catch(error){if(error.code==='ENOENT')return [];throw error;}}
export function createContractCI({directory=fileURLToPath(new URL('../.ci/',import.meta.url)),now=()=>new Date().toISOString()}={}){
  const versionsPath=join(directory,'versions.jsonl'),reviewsPath=join(directory,'reviews.jsonl');let queue=Promise.resolve();
  const serialize=fn=>{const run=queue.then(fn);queue=run.catch(()=>{});return run;};
  async function versions(){const rows=await readLines(versionsPath);for(const row of rows)assert(row.contentHash===hash(row.draft),'Archive CI altérée : empreinte SHA-256 invalide.');return rows;}
  async function view(){const [all,reviews]=await Promise.all([versions(),readLines(reviewsPath)]);return {versions:all,reviews,notice:'Versions rédigées dans cet outil et observées à leur enregistrement local. L’empreinte détecte une modification locale ; elle ne prouve aucune publication par une plateforme.'};}
  async function save(input){return serialize(async()=>{const report=analyzeDraft(input),all=await versions(),previous=all.filter(v=>v.draft.draftId===report.draft.draftId).at(-1);if(previous?.contentHash===report.contentHash)return {stored:false,version:previous,report,state:await view()};await mkdir(directory,{recursive:true,mode:0o700});const version={id:randomUUID(),savedAt:now(),draft:report.draft,contentHash:report.contentHash,previousHash:previous?.contentHash??null};await appendFile(versionsPath,JSON.stringify(version)+'\n',{mode:0o600});return {stored:true,version,report,state:await view()};});}
  async function review(input){return serialize(async()=>{assert(typeof input.versionId==='string','Version requise');assert(['approved','changes_requested'].includes(input.verdict),'Verdict invalide');text(input.note,'note',2000);assert(input.note.trim().length>=10,'Note de revue requise (10 caractères minimum)');const all=await versions(),version=all.find(v=>v.id===input.versionId);assert(version,'Version introuvable');const latest=all.filter(v=>v.draft.draftId===version.draft.draftId).at(-1);assert(latest.id===version.id,'La revue porte sur une ancienne version');const report=analyzeDraft(version.draft);if(input.verdict==='approved')assert(report.readyForReview,'Corriger les blocages avant approbation');const record={id:randomUUID(),versionId:version.id,contentHash:version.contentHash,verdict:input.verdict,note:input.note.trim(),reviewedAt:now()};await appendFile(reviewsPath,JSON.stringify(record)+'\n',{mode:0o600});return {record,state:await view()};});}
  return {view,save,review};
}

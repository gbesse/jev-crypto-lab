import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {relation,fill,analyzeContracts} from '../src/contracts.js';
import {analyzeExposure} from '../src/exposure.js';
const fixture=JSON.parse(await readFile(new URL('../data/demo.json',import.meta.url),'utf8'));
const demo=()=>structuredClone(fixture);

test('implication: horizon court → horizon long, et pas l’inverse',()=>{
 const [a,b]=demo().contracts.markets;assert.equal(relation(a,b).kind,'b-implies-a');assert.equal(relation(b,a).kind,'a-implies-b');
});
test('preuve vérifiée contre une énumération de trajectoires et seuils',()=>{
 const [a,b]=demo().contracts.markets;a.normalized.end='2026-12-31T00:00:00Z';b.normalized.end='2026-11-30T00:00:00Z';
 for(const ta of [100,120,140])for(const tb of [100,120,140]){
  a.normalized.threshold=ta;b.normalized.threshold=tb;const r=relation(a,b).kind;
  for(const first of [90,110,130,150])for(const later of [90,110,130,150]){
   const A=Math.max(first,later)>ta,B=first>tb;
   if(r==='b-implies-a')assert.ok(!B||A);
   if(r==='a-implies-b')assert.ok(!A||B);
  }
 }
});
test('différentes sources, types et comparateurs ne sont jamais certifiés',()=>{
 const [a,b]=demo().contracts.markets;
 for(const [field,value] of [['source','other'],['kind','terminal'],['comparator','gte'],['settlement','refund']]){const c=structuredClone(b);c.normalized[field]=value;assert.equal(relation(a,c).kind,'incompatible');}
});
test('refus des clauses non revues et des remboursements',()=>{
 const [a,b]=demo().contracts.markets;b.reviewed=false;assert.equal(relation(a,b).kind,'unverified');b.reviewed=true;a.normalized.voidPolicy=b.normalized.voidPolicy='refund';assert.equal(relation(a,b).kind,'unsupported');
});
test('deux observations terminales à des dates différentes ne s’impliquent pas',()=>{
 const [a,b]=demo().contracts.markets;a.normalized.kind=b.normalized.kind='terminal';assert.equal(relation(a,b).kind,'incompatible');
});
test('fenêtres avec débuts différents sont écartées',()=>{const[a,b]=demo().contracts.markets;b.normalized.start='2026-09-02T00:00:00Z';assert.equal(relation(a,b).kind,'incompatible');});
test('VWAP consomme les niveaux du carnet dans le bon ordre',()=>{assert.deepEqual(fill([{price:.6,size:50},{price:.4,size:50}],100),{complete:true,cost:50,filled:100,vwap:.5});assert.equal(fill([{price:.4,size:50}],100).complete,false);});
test('candidat calculé après profondeur, frais et marge',()=>{
 const r=analyzeContracts(demo().contracts);const p=r.pairs.find(p=>p.status==='candidate');assert.equal(r.candidates,1);assert.equal(p.cost,93.4);assert.equal(p.friction,.6538);assert.equal(p.netFloor,5.9462);assert.equal(Math.min(...p.proof.map(x=>x.payout)),1);
});
test('hausse des frais élimine le candidat',()=>{const d=demo().contracts;d.feeBps=1000;assert.equal(analyzeContracts(d).candidates,0);});
test('profondeur insuffisante ne donne aucun faux profit',()=>{const d=demo().contracts;d.quantity=500;assert.equal(analyzeContracts(d).candidates,0);assert.ok(analyzeContracts(d).pairs.some(p=>p.status==='insufficient-depth'));});
test('carnets périmés, futurs et désynchronisés sont rejetés',()=>{
 for(const timestamp of ['2026-09-21T11:00:00Z','2026-09-21T12:00:01Z','2026-09-21T11:59:45Z']){
  const d=demo().contracts;d.markets[0].quotes.yes.observedAt=timestamp;assert.equal(analyzeContracts(d).candidates,0);
 }
});
test('équivalence permet deux orientations, jamais un paiement fictif',()=>{const d=demo().contracts;d.markets=d.markets.slice(0,2);d.markets[1].normalized=structuredClone(d.markets[0].normalized);assert.equal(analyzeContracts(d).pairs.length,2);});
test('entrées non finies, identifiants dupliqués et dates sans fuseau rejetés',()=>{
 const d=demo().contracts;d.quantity=NaN;assert.throws(()=>analyzeContracts(d));d.quantity=100;d.markets[1].id=d.markets[0].id;assert.throws(()=>analyzeContracts(d));assert.throws(()=>analyzeContracts({...demo().contracts,asOf:'2026-09-21'}));
 assert.throws(()=>analyzeContracts({...demo().contracts,asOf:'2026-02-30T12:00:00Z'}),/calendrier/);
});
test('exposition indirecte pondérée et provenance des chemins',()=>{
 const r=analyzeExposure(demo().exposure);const a=r.alerts.find(a=>a.incident.id==='i1');assert.equal(a.upperBoundUsd,17000);assert.deepEqual(a.affected[0].paths[0].nodes,['vault','staked','issuer']);assert.equal(r.potentialExposureUpperBoundUsd,25000);assert.equal(r.totalValueUsd,35000);assert.equal(r.gaps.length,2);
});
test('replay exclut événements non observés sans lire le futur',()=>{
 const d=demo().exposure;d.asOf='2026-09-21T10:01:00Z';const r=analyzeExposure(d);assert.equal(r.potentialExposureUpperBoundUsd,0);assert.ok(r.ignored.some(x=>x.id==='i1'&&x.reason==='not-yet-known'));
});
test('incidents multiples et chemins convergents ne dépassent pas une position',()=>{
 const d=demo().exposure;d.incidents.push({...d.incidents[0],id:'another'});d.edges.push({from:'vault',to:'issuer',kind:'dependency',fraction:1,evidence:'Shared dependency',observedAt:'2026-09-20T08:00:00Z'});
 const r=analyzeExposure(d);assert.equal(r.potentialExposureUpperBoundUsd,25000);assert.ok(r.alerts.every(a=>a.affected.every(p=>p.upperBoundUsd<=p.valueUsd)));
});
test('cycles, nœuds inconnus et allocations >100% sont rejetés',()=>{
 const d=demo().exposure;d.edges.push({from:'issuer',to:'vault',kind:'dependency',fraction:1,evidence:'Cycle',observedAt:'2026-09-20T08:00:00Z'});assert.throws(()=>analyzeExposure(d),/Cycle/);
 const e=demo().exposure;e.edges[0].fraction=.9;assert.throws(()=>analyzeExposure(e),/100/);
 const f=demo().exposure;f.positions[0].node='unknown';assert.throws(()=>analyzeExposure(f),/nœud/);
});
test('liens futurs sont exclus du replay',()=>{const d=demo().exposure;d.edges[2].observedAt='2026-09-22T00:00:00Z';assert.equal(analyzeExposure(d).alerts.find(a=>a.incident.id==='i1').upperBoundUsd,0);});
test('absence de chemin connue reste explicite',()=>{const d=demo().exposure;d.edges=[];const r=analyzeExposure(d);assert.equal(r.alerts[0].status,'no-known-path');assert.match(r.interpretation,/ne signifie pas absence/);});

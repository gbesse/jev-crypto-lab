import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {once} from 'node:events';
import {createApp} from '../src/server.js';
import {analyzeResolution} from '../src/resolution.js';

const demo=JSON.parse(await readFile(new URL('../data/demo.json',import.meta.url),'utf8'));
const input=()=>({...structuredClone(demo.resolution),markets:structuredClone(demo.contracts.markets)});

test('sources divergentes : clauses, issues et résultat brut sont traçables',()=>{
  const r=analyzeResolution(input());
  assert.deepEqual(r.clauses.filter(c=>!c.same).map(c=>c.field),['source']);
  assert.match(r.clauses.find(c=>c.field==='source').rightExcerpt,/Autre index/);
  assert.equal(r.divergence,true);
  assert.equal(r.outcomes['btc-nov'].value,true);
  assert.equal(r.outcomes['btc-other'].value,false);
  assert.equal(r.totalCost,115);
  assert.equal(r.totalPnl,85);
  assert.equal(r.review.confirmed,false);
});

test('une trajectoire partielle ne transforme jamais une absence de franchissement en NO',()=>{
  const d=input();d.scenario.completeHypothetical=false;
  const r=analyzeResolution(d);
  assert.equal(r.outcomes['btc-nov'].value,true);
  assert.equal(r.outcomes['btc-other'].value,null);
  assert.equal(r.divergence,null);
  assert.equal(r.totalPnl,null);
  assert.equal(r.totalPnlMin,-15);
  assert.equal(r.totalPnlMax,85);
});

test('une observation commune ne peut créer une divergence entre prédicats identiques',()=>{
  const d=input();d.markets.find(m=>m.id==='btc-other').normalized.source=d.markets.find(m=>m.id==='btc-nov').normalized.source;
  const r=analyzeResolution(d);
  assert.equal(r.divergence,false);
  assert.equal(r.outcomes['btc-other'].value,true);
  assert.equal(r.totalPnl,-15);
});

test('un contrat terminal exige la mesure à la date exacte de clôture',()=>{
  const d=input();d.rightId='btc-terminal';d.positions=[];
  const r=analyzeResolution(d);
  assert.equal(r.outcomes['btc-terminal'].value,null);
  d.scenario.observations.push({source:'Atlas BTC/USD index (fictif)',at:'2026-12-31T23:59:59Z',value:119000});
  assert.equal(analyzeResolution(d).outcomes['btc-terminal'].value,false);
});

test('la revue de la paire exige une note et les deux contrats déjà revus',()=>{
  const d=input();d.pairReview={confirmed:true,note:'Clauses fictives et sources relues.'};
  assert.equal(analyzeResolution(d).review.confirmed,true);
  d.markets.find(m=>m.id==='btc-other').reviewed=false;
  assert.equal(analyzeResolution(d).review.confirmed,false);
  d.pairReview.note='';
  assert.throws(()=>analyzeResolution(d),/pairReview.note/);
});

test('observations dupliquées et positions hors de la paire sont rejetées',()=>{
  const d=input();d.scenario.observations.push({...d.scenario.observations[0]});
  assert.throws(()=>analyzeResolution(d),/dupliquées/);
  d.scenario.observations.pop();d.positions[0].market='btc-dec';
  assert.throws(()=>analyzeResolution(d),/hors de la paire/);
});

test('un extrait de clause doit apparaître dans le texte original',()=>{
  const d=input();d.markets.find(m=>m.id==='btc-other').clauseEvidence.source='Texte absent';
  assert.throws(()=>analyzeResolution(d),/extrait absent/);
});

test('route HTTP du radar retourne le même dossier que le moteur',async t=>{
  const app=createApp();app.listen(0,'127.0.0.1');await once(app,'listening');
  t.after(()=>{app.closeAllConnections();app.close();});
  const response=await fetch(`http://127.0.0.1:${app.address().port}/api/resolution`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input())});
  assert.equal(response.status,200);
  assert.equal((await response.json()).totalPnl,85);
});

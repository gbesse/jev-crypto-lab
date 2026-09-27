import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createMemory,snapshot,compareSnapshots} from '../src/memory.js';
import {createApp} from '../src/server.js';
import {buildQuestions} from '../src/jev.js';

const raw=(description='Price above 100',extra={})=>({id:42,question:'Will BTC exceed 100?',description,resolutionSource:'Index A',endDate:'2026-12-31T00:00:00Z',slug:'btc-100',...extra});
test('empreinte canonique et diff séparent règle et métadonnée',()=>{
  const a=snapshot(raw('Règle A',{cryptoMarketConfig:{z:1,a:2}}),'2026-09-27T00:00:00Z');
  const b=snapshot(raw('Règle A',{cryptoMarketConfig:{a:2,z:1}}),'2026-09-27T00:15:00Z');
  assert.equal(a.contentHash,b.contentHash);
  const c=snapshot(raw('Règle B',{active:false,cryptoMarketConfig:{a:2,z:1}}),'2026-09-27T00:30:00Z');
  const diff=compareSnapshots(a,c);
  assert.deepEqual(diff.changes.map(x=>[x.field,x.kind]),[['description','rule_or_resolution'],['active','metadata']]);
  assert.notEqual(diff.beforeHash,diff.afterHash);
});

test('capture prospective, déduplication, position et revue survivent au redémarrage',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'jev-memory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let source=raw(),tick=0;
  const fetcher=async url=>({ok:true,json:async()=>{assert.match(url,/\/markets\/42$/);return source;}});
  const now=()=>new Date(Date.UTC(2026,8,27,0,tick++*15)).toISOString();
  const store=createMemory({directory,fetcher,now});
  let state=await store.add('42');assert.equal(state.snapshots.length,1);
  let run=await store.capture();assert.equal(run.result.unchanged,1);assert.equal(run.state.snapshots.length,1);
  source=raw('Price above 101',{resolutionSource:'Index B'});
  run=await store.capture();assert.equal(run.result.stored,1);
  state=await store.setPosition({marketId:'42',side:'YES',quantity:100,entryPrice:0.45});
  assert.equal(state.changes[0].impact.entryCostUsd,45);
  const change=state.changes[0];assert.deepEqual(change.changes.map(c=>c.field),['description','resolutionSource']);
  assert.equal((await store.getPair(change.id)).before.fields.description,'Price above 100');
  state=await store.review({changeId:change.id,verdict:'confirmed',note:'Source et seuil revus dans les deux versions.'});
  assert.equal(state.changes[0].review.verdict,'confirmed');
  const restarted=createMemory({directory,fetcher,now});assert.equal((await restarted.view()).changes[0].review.verdict,'confirmed');
  assert.equal((await readFile(join(directory,'snapshots.jsonl'),'utf8')).trim().split('\n').length,2);
  await assert.rejects(()=>restarted.setPosition({marketId:'42',side:'YES',quantity:100,entryPrice:2}),/Prix invalide/);
  await assert.rejects(()=>restarted.review({changeId:change.id,verdict:'confirmed',note:'court'}),/Note de revue/);
  state=await restarted.remove('42');assert.equal(state.marketIds.length,0);assert.equal(state.snapshots.length,2);
});

test('échec de Gamma et ID incohérent ne créent pas de faux instantané',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'jev-memory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const store=createMemory({directory,fetcher:async()=>({ok:true,json:async()=>raw('x',{id:43})})});
  await assert.rejects(()=>store.add('42'),/ID Gamma inattendu/);
  assert.equal((await store.view()).snapshots.length,0);
});

test('API locale expose le journal et ne transmet à Jev que les deux versions du changement',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'jev-memory-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  let source=raw();const memory=createMemory({directory,fetcher:async()=>({ok:true,json:async()=>source})});
  const app=createApp({memory});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});
  const base=`http://127.0.0.1:${app.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await post('/api/memory/add',{marketId:'42'})).status,200);
  source=raw('Price above 101');const run=await(await post('/api/memory/capture',{})).json();assert.equal(run.result.stored,1);
  const state=await(await fetch(base+'/api/memory')).json();assert.equal(state.changes.length,1);
  assert.equal((await post('/api/memory/review',{changeId:state.changes[0].id,verdict:'cosmetic',note:'Différence relue avec source originale.'})).status,200);
  assert.equal((await post('/api/memory/judge',{changeId:'0'.repeat(64)})).status,404);
  const questions=buildQuestions({task:'rule_change',before:'{"description":"A"}',after:'{"description":"B"}'});
  assert.deepEqual(Object.keys(questions.questions),['trigger','resolution','exceptions']);
});

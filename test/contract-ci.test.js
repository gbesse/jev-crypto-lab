import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {analyzeDraft,resolveReleases,createContractCI} from '../src/contract-ci.js';
import {createApp} from '../src/server.js';
import {buildQuestions} from '../src/jev.js';

const demo=JSON.parse(await readFile(new URL('../data/ci-demo.json',import.meta.url),'utf8'));

test('scénarios à la frontière, corrections et données manquantes sont déterministes',()=>{
  const report=analyzeDraft(demo);
  assert.equal(report.readyForReview,true);
  assert.equal(report.scenarios.length,7);
  assert.equal(report.scenarios.find(s=>s.id==='equal').outcome,'NO');
  assert.equal(report.scenarios.find(s=>s.id==='correction').outcome,'NO');
  assert.equal(report.scenarios.find(s=>s.id==='lateCorrection').outcome,'NO');
  assert.equal(report.scenarios.find(s=>s.id==='late').outcome,'UNKNOWN');
  const inclusive=analyzeDraft({...demo,comparator:'gte'});
  assert.equal(inclusive.scenarios.find(s=>s.id==='equal').status,'fail');
  const corrected=analyzeDraft({...demo,correctionPolicy:'latest_by_cutoff'});
  assert.equal(corrected.scenarios.find(s=>s.id==='correction').status,'fail');
  const voided=analyzeDraft({...demo,unavailablePolicy:'void'});
  assert.equal(voided.scenarios.find(s=>s.id==='unavailable').outcome,'VOID');
  assert.equal(resolveReleases(demo,[{publishedAt:'2027-12-31T23:58:00Z',value:99},{publishedAt:'2027-12-31T23:58:00Z',value:101}]).outcome,'UNKNOWN');
});

test('un extrait absent ou faux bloque la revue et le contenu reste hashé',()=>{
  const missing=analyzeDraft({...demo,evidence:{...demo.evidence,cutoff:''}});
  assert.equal(missing.readyForReview,false);
  assert.ok(missing.issues.some(i=>i.code==='missing_cutoff'));
  const mismatched=analyzeDraft({...demo,sourceUrl:'https://example.org/other'});
  assert.ok(mismatched.issues.some(i=>i.code==='source_spec_mismatch'));
  const unreviewed=analyzeDraft({...demo,assertions:{...demo.assertions,equal:null}});
  assert.ok(unreviewed.issues.some(i=>i.code==='unreviewed_equal'));
  assert.notEqual(missing.contentHash,analyzeDraft(demo).contentHash);
});

test('versions, déduplication, approbation et vérification après redémarrage',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'jev-ci-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const ci=createContractCI({directory});
  let saved=await ci.save(demo);assert.equal(saved.stored,true);
  assert.equal((await ci.save(demo)).stored,false);
  await assert.rejects(()=>ci.review({versionId:saved.version.id,verdict:'approved',note:'Trop bref'}),/10 caractères/);
  await ci.review({versionId:saved.version.id,verdict:'approved',note:'Clauses, source et scénarios relus sur le projet fictif.'});
  saved=await ci.save({...demo,assertions:{...demo.assertions,equal:'YES'}});
  assert.equal(saved.stored,true);assert.equal(saved.report.readyForReview,false);
  await assert.rejects(()=>ci.review({versionId:saved.version.id,verdict:'approved',note:'Approbation après revue humaine.'}),/blocages/);
  const older=(await ci.view()).versions[0];
  await assert.rejects(()=>ci.review({versionId:older.id,verdict:'approved',note:'Approbation de l’ancienne version.'}),/ancienne version/);
  const restarted=createContractCI({directory});assert.equal((await restarted.view()).versions.length,2);
  const path=join(directory,'versions.jsonl'),rows=(await readFile(path,'utf8')).trim().split('\n').map(JSON.parse);
  rows[0].draft.title='modifié';await writeFile(path,rows.map(JSON.stringify).join('\n')+'\n');
  await assert.rejects(()=>restarted.view(),/empreinte SHA-256 invalide/);
});

test('API CI locale et questions Jev sur un brouillon',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'jev-ci-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  const app=createApp({ci:createContractCI({directory})});app.listen(0,'127.0.0.1');await once(app,'listening');t.after(()=>{app.closeAllConnections();app.close();});
  const base=`http://127.0.0.1:${app.address().port}`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  assert.equal((await fetch(base+'/api/ci/demo')).status,200);
  const analyzed=await(await post('/api/ci/analyze',demo)).json();assert.equal(analyzed.readyForReview,true);
  const saved=await(await post('/api/ci/save',demo)).json();assert.equal(saved.stored,true);
  assert.equal((await(await fetch(base+'/api/ci')).json()).versions.length,1);
  assert.equal((await post('/api/ci/review',{versionId:saved.version.id,verdict:'approved',note:'Projet fictif relu par le test.'})).status,200);
  const questions=buildQuestions({task:'draft',title:demo.title,rules:demo.rulesText,sourceName:demo.sourceName,correctionPolicy:demo.correctionPolicy,thresholdExcerpt:demo.evidence.threshold,sourceExcerpt:demo.evidence.source,correctionExcerpt:demo.evidence.corrections});
  assert.deepEqual(Object.keys(questions.questions),['titleTrigger','source','corrections']);
  assert.ok(!JSON.stringify(questions.state).includes('Seules les publications horodatées'));
});

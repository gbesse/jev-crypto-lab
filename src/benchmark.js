import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {analyzeContracts} from './contracts.js';
import {analyzeExposure} from './exposure.js';
const demo=JSON.parse(await readFile(new URL('../data/demo.json',import.meta.url),'utf8'));
const scenarios=[
 {name:'Friction standard',change:d=>{},expected:1},
 {name:'Frais supérieurs au spread',change:d=>{d.feeBps=1000;},expected:0},
 {name:'Manque de profondeur',change:d=>{d.quantity=500;},expected:0},
 {name:'Source de résolution différente',change:d=>{d.markets[1].normalized.source='Another source';},expected:0},
 {name:'Règles non revues',change:d=>{d.markets[1].reviewed=false;},expected:0},
 {name:'Carnet périmé',change:d=>{d.markets[0].quotes.yes.observedAt='2026-09-21T11:00:00Z';},expected:0}
];
const results=scenarios.map(s=>{const d=structuredClone(demo.contracts);s.change(d);const r=analyzeContracts(d);return {scenario:s.name,expected:s.expected,actual:r.candidates,pass:r.candidates===s.expected};});
const replay=['2026-09-21T09:00:00Z','2026-09-21T10:30:00Z','2026-09-21T12:00:00Z'].map(asOf=>{const r=analyzeExposure({...demo.exposure,asOf});return {asOf,potentialExposureUpperBoundUsd:r.potentialExposureUpperBoundUsd,activeIncidents:r.alerts.length};});
const output={generatedAt:new Date().toISOString(),dataset:'synthetic-v1',claims:'Validation fonctionnelle seulement. Aucun appel Jev, aucune mesure d’alpha ou de performance sur incidents réels.',results,replay};
const dir=new URL('../output/',import.meta.url);await mkdir(dir,{recursive:true});await writeFile(new URL('benchmark.json',dir),JSON.stringify(output,null,2));console.log(JSON.stringify(output,null,2));if(results.some(r=>!r.pass))process.exitCode=1;

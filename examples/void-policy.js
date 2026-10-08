// Demonstrate why a refund or cancellation clause blocks a binary payoff proof.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeContracts } from '../src/contracts.js';

const fixture = JSON.parse(await readFile(new URL('../data/demo.json', import.meta.url), 'utf8')).contracts;
const binary = analyzeContracts(structuredClone(fixture));
const withRefund = structuredClone(fixture);
for (const market of withRefund.markets) market.normalized.voidPolicy = 'refund-on-cancellation';
const refund = analyzeContracts(withRefund);
assert.ok(binary.candidates > 0);
assert.equal(refund.candidates, 0);
assert.ok(refund.pairs.some(pair => pair.relation.kind === 'unsupported'));
console.log(JSON.stringify({ synthetic: true, binaryCandidates: binary.candidates, refundCandidates: refund.candidates, reason: 'unsupported-void-policy' }, null, 2));

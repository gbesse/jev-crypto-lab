import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { analyzeContracts } from '../src/contracts.js';

const fixture = JSON.parse(await readFile(new URL('../data/demo.json', import.meta.url), 'utf8')).contracts;
const rows = [0, 50, 250, 500, 1000].map((feeBps) => {
  const report = analyzeContracts({ ...structuredClone(fixture), feeBps });
  const evaluated = report.pairs.find((pair) => pair.netFloor !== undefined);
  return { feeBps, candidates: report.candidates, status: evaluated?.status, conditionalNetFloorUsd: evaluated?.netFloor };
});
assert.ok(rows[0].candidates > 0);
assert.equal(rows.at(-1).candidates, 0);
assert.ok(rows.every((row, index) => index === 0 || row.conditionalNetFloorUsd <= rows[index - 1].conditionalNetFloorUsd));
console.log(JSON.stringify({ synthetic: true, unit: '100 units per leg', interpretation: 'Conditional paper calculation only; no executable profit claim', rows }, null, 2));

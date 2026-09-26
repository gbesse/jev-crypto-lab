import { assert, text, number, time, list, unique, round } from './validation.js';

export function validateMarket(m) {
  text(m.id, 'market.id', 120); text(m.title, 'market.title'); text(m.rulesText, 'market.rulesText');
  assert(m.normalized && typeof m.normalized === 'object', 'Règles normalisées requises');
  const r = m.normalized;
  for (const k of ['asset', 'source', 'currency', 'settlement', 'voidPolicy']) text(r[k], `normalized.${k}`, 200);
  assert(['anytime', 'terminal'].includes(r.kind), 'kind: anytime ou terminal');
  assert(['gt', 'gte'].includes(r.comparator), 'comparator: gt ou gte');
  number(r.threshold, 'threshold', 0, 1e9);
  assert(time(r.start, 'start') < time(r.end, 'end'), 'Fenêtre temporelle invalide');
  assert(typeof m.reviewed === 'boolean', 'reviewed: booléen requis');
  if (m.reviewed) text(m.reviewEvidence, 'reviewEvidence');
  return m;
}

// Conditional theorem over normalized contracts. Model confidence cannot certify the premises.
export function relation(a, b) {
  validateMarket(a); validateMarket(b);
  const x = a.normalized, y = b.normalized;
  if (!a.reviewed || !b.reviewed) return { kind: 'unverified', reason: 'Normalisation non revue : aucune preuve de relation.' };
  for (const k of ['asset', 'source', 'currency', 'settlement', 'voidPolicy', 'kind', 'comparator']) {
    if (x[k] !== y[k]) return { kind: 'incompatible', reason: `Clauses différentes : ${k}.` };
  }
  // This prototype certifies binary 0/1 payouts only; refunds/cancellations need more states.
  if (x.voidPolicy !== 'binary-only') return { kind: 'unsupported', reason: 'Annulation/remboursement : états supplémentaires nécessaires.' };
  const sameStart = time(x.start, 'start') === time(y.start, 'start');
  const sameEnd = time(x.end, 'end') === time(y.end, 'end');
  if (!sameStart || (x.kind === 'terminal' && !sameEnd)) return { kind: 'incompatible', reason: 'Fenêtres non comparables pour ce type de contrat.' };
  if (x.threshold === y.threshold && sameEnd) return { kind: 'equivalent', reason: 'Même prédicat, même fenêtre et mêmes clauses de résolution.' };
  // A higher threshold in a shorter window implies a lower threshold in a longer window.
  const aImpliesB = x.threshold >= y.threshold && time(x.end, 'end') <= time(y.end, 'end');
  const bImpliesA = y.threshold >= x.threshold && time(y.end, 'end') <= time(x.end, 'end');
  if (aImpliesB) return { kind: 'a-implies-b', reason: 'Le seuil de A est au moins celui de B et sa fenêtre est incluse.' };
  if (bImpliesA) return { kind: 'b-implies-a', reason: 'Le seuil de B est au moins celui de A et sa fenêtre est incluse.' };
  return { kind: 'unrelated', reason: 'Aucune implication démontrée par les règles prises en charge.' };
}

export function fill(asks, quantity) {
  list(asks, 'asks', 1000); number(quantity, 'quantity', 0.000001, 1e6);
  const levels = asks.map(l => ({ price: number(l.price, 'ask.price', 0.000001, 1), size: number(l.size, 'ask.size', 0, 1e9) })).sort((a,b) => a.price-b.price);
  let left = quantity, cost = 0;
  for (const l of levels) { const take = Math.min(left, l.size); cost += take*l.price; left -= take; if (left < 1e-9) break; }
  return { complete: left < 1e-9, cost: round(cost), filled: round(quantity-left), vwap: round(cost/(quantity-left || 1)) };
}

export function analyzeContracts(input) {
  const markets = list(input.markets, 'markets', 80).map(validateMarket); unique(markets, 'id', 'markets');
  const asOf = time(input.asOf, 'asOf');
  const quantity = number(input.quantity ?? 100, 'quantity', 1, 1e6);
  const feeBps = number(input.feeBps ?? 50, 'feeBps', 0, 1000);
  const bufferBps = number(input.bufferBps ?? 20, 'bufferBps', 0, 1000);
  const maxAgeMs = number(input.maxAgeMs ?? 30000, 'maxAgeMs', 1, 3600000);
  const maxSkewMs = number(input.maxSkewMs ?? 5000, 'maxSkewMs', 0, 60000);
  const pairs = [];
  for (let i=0;i<markets.length;i++) for (let j=i+1;j<markets.length;j++) {
    const a=markets[i], b=markets[j], rel=relation(a,b);
    const directions = rel.kind === 'equivalent' ? [[a,b],[b,a]] : rel.kind === 'a-implies-b' ? [[a,b]] : rel.kind === 'b-implies-a' ? [[b,a]] : [];
    if (!directions.length) { pairs.push({ a:a.id, b:b.id, relation:rel, status:'excluded' }); continue; }
    for (const [narrow,broad] of directions) {
      const base = { a:a.id, b:b.id, relation:rel, legs:[{market:broad.id,side:'YES'},{market:narrow.id,side:'NO'}], quantity,
        proof:[{narrow:0,broad:0,payout:1},{narrow:0,broad:1,payout:2},{narrow:1,broad:1,payout:1}],
        excludedState:{narrow:1,broad:0,reason:'Impossible uniquement si la normalisation et les clauses sont correctes.'},
        assumptions:['Contrats binaires réglés conformément aux clauses revues.', 'Les deux jambes sont entièrement exécutées aux prix simulés.', 'Frais proportionnels et marge de glissement définis par l’utilisateur ; barème réel non vérifié.'],
        evidence:[a.reviewEvidence,b.reviewEvidence] };
      const books = [broad.quotes?.yes,narrow.quotes?.no];
      if (books.some(x=>!x)) { pairs.push({...base,status:'missing-quotes'}); continue; }
      const times = books.map(q=>time(q.observedAt,'quote.observedAt'));
      if (times.some(t=>t>asOf || asOf-t>maxAgeMs) || Math.abs(times[0]-times[1])>maxSkewMs) { pairs.push({...base,status:'stale-quotes'}); continue; }
      if (asOf >= Math.min(time(a.normalized.end,'end'),time(b.normalized.end,'end'))) { pairs.push({...base,status:'expired'}); continue; }
      const fills=books.map(q=>fill(q.asks,quantity));
      if(fills.some(f=>!f.complete)){pairs.push({...base,status:'insufficient-depth',fills});continue;}
      const cost=round(fills.reduce((s,f)=>s+f.cost,0));
      // Round costs up to the micro-dollar, lower-bound P&L down.
      const friction=Math.ceil(cost*(feeBps+bufferBps)/10000*1e6)/1e6;
      const netFloor=Math.floor((quantity-cost-friction+1e-10)*1e6)/1e6;
      pairs.push({...base,status:netFloor>0?'candidate':'no-edge',fills,cost,friction:round(friction),minimumPayout:quantity,netFloor,returnOnCost:round(netFloor/(cost+friction))});
    }
  }
  return {asOf:input.asOf,mode:'conditional-paper-analysis',feeBps,bufferBps,markets:markets.length,pairs,candidates:pairs.filter(p=>p.status==='candidate').length};
}

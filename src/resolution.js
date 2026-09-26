import {assert, text, number, time, list, unique, round} from './validation.js';
import {validateMarket, relation} from './contracts.js';

const fields=['asset','source','currency','settlement','voidPolicy','kind','comparator','threshold','start','end'];
function excerpt(market,field){
  const value=market.clauseEvidence?.[field];
  if(value===undefined)return null;
  text(value,`clauseEvidence.${field}`,1000);
  assert(market.rulesText.includes(value),`clauseEvidence.${field}: extrait absent du texte original.`);
  return value;
}

function outcome(market, scenario) {
  const rule=market.normalized;
  const points=scenario.observations.filter(o=>o.source===rule.source && time(o.at,'observation.at')>=time(rule.start,'start') && time(o.at,'observation.at')<=time(rule.end,'end'));
  if(rule.kind==='terminal'){
    const final=points.find(o=>time(o.at,'observation.at')===time(rule.end,'end'));
    if(!final)return {value:null,reason:'Aucune observation à la date exacte de clôture.'};
    return {value:rule.comparator==='gt'?final.value>rule.threshold:final.value>=rule.threshold,measurement:final.value,at:final.at,reason:'Observation à la clôture fournie.'};
  }
  if(!points.length)return {value:null,reason:'Aucune observation fournie dans la fenêtre.'};
  const peak=points.reduce((a,b)=>b.value>a.value?b:a);
  const hit=rule.comparator==='gt'?peak.value>rule.threshold:peak.value>=rule.threshold;
  if(!hit&&!scenario.completeHypothetical)return {value:null,measurement:peak.value,at:peak.at,reason:'Un échantillon sous le seuil ne prouve pas que le seuil n’a jamais été franchi.'};
  return {value:hit,measurement:peak.value,at:peak.at,reason:hit?'Franchissement observé dans le scénario.':'Seuil non franchi dans la trajectoire hypothétique déclarée complète.'};
}

export function analyzeResolution(input){
  const markets=list(input.markets,'markets',80).map(validateMarket);unique(markets,'id','markets');
  const leftId=text(input.leftId,'leftId',120),rightId=text(input.rightId,'rightId',120);
  assert(leftId!==rightId,'Choisir deux contrats différents.');
  const left=markets.find(m=>m.id===leftId),right=markets.find(m=>m.id===rightId);
  assert(left&&right,'Contrat sélectionné introuvable.');
  const scenario=input.scenario;
  assert(scenario&&typeof scenario==='object','Scénario requis.');
  text(scenario.label,'scenario.label',300);
  assert(typeof scenario.completeHypothetical==='boolean','completeHypothetical: booléen requis');
  const observations=list(scenario.observations,'observations',200).map(o=>({source:text(o.source,'observation.source',200),at:o.at,value:number(o.value,'observation.value',0,1e9)}));
  observations.forEach(o=>time(o.at,'observation.at'));
  assert(new Set(observations.map(o=>`${o.source}\0${time(o.at,'observation.at')}`)).size===observations.length,'Observations contradictoires ou dupliquées.');
  const positions=list(input.positions??[],'positions',40).map(p=>{
    assert([leftId,rightId].includes(p.market),'Position hors de la paire sélectionnée.');
    assert(['YES','NO'].includes(p.side),'Position: côté YES ou NO requis.');
    return {market:p.market,side:p.side,quantity:number(p.quantity,'position.quantity',0.000001,1e6),entryPrice:number(p.entryPrice,'position.entryPrice',0,1)};
  });
  const pairReview=input.pairReview??{confirmed:false,note:''};
  assert(typeof pairReview.confirmed==='boolean','pairReview.confirmed: booléen requis');
  assert(typeof pairReview.note==='string'&&pairReview.note.length<=2000,'pairReview.note: texte de 2000 caractères maximum');
  if(pairReview.confirmed)text(pairReview.note,'pairReview.note',2000);
  const clauses=fields.map(field=>({field,left:left.normalized[field],right:right.normalized[field],leftExcerpt:excerpt(left,field),rightExcerpt:excerpt(right,field),same:['start','end'].includes(field)?time(left.normalized[field],field)===time(right.normalized[field],field):left.normalized[field]===right.normalized[field]}));
  const outcomes={[leftId]:outcome(left,{...scenario,observations}),[rightId]:outcome(right,{...scenario,observations})};
  const a=outcomes[leftId].value,b=outcomes[rightId].value;
  const results=positions.map(p=>{
    const value=outcomes[p.market].value;
    const cost=round(p.quantity*p.entryPrice);
    const payout=value===null?null:round(p.quantity*(p.side==='YES'?Number(value):Number(!value)));
    const pnl=payout===null?null:round(payout-cost);
    return {...p,cost,payout,pnl,pnlMin:pnl===null?round(-cost):pnl,pnlMax:pnl===null?round(p.quantity-cost):pnl};
  });
  const totalCost=round(results.reduce((sum,p)=>sum+p.cost,0));
  const known=results.every(p=>p.pnl!==null);
  return {leftId,rightId,clauses,relation:relation(left,right),review:{confirmed:pairReview.confirmed&&left.reviewed&&right.reviewed,note:pairReview.note||'',marketReviews:[{id:leftId,reviewed:left.reviewed,evidence:left.reviewEvidence||''},{id:rightId,reviewed:right.reviewed,evidence:right.reviewEvidence||''}]},scenario:{label:scenario.label,completeHypothetical:scenario.completeHypothetical,observations},outcomes,divergence:a===null||b===null?null:a!==b,positions:results,totalCost,totalPnl:known?round(results.reduce((sum,p)=>sum+p.pnl,0)):null,totalPnlMin:round(results.reduce((sum,p)=>sum+p.pnlMin,0)),totalPnlMax:round(results.reduce((sum,p)=>sum+p.pnlMax,0)),interpretation:'Calcul de paiement brut sur un scénario hypothétique. La revue déclarée ne certifie pas la normalisation, la source, la réalisation du scénario ni l’exécution des positions.'};
}

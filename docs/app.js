const $=id=>document.getElementById(id);
const filterButtons=[...document.querySelectorAll('[data-filter]')];
const search=$('market-search');
if(search){
  let active='all';
  const update=()=>{
    const query=search.value.trim().toLowerCase();let shown=0;
    document.querySelectorAll('#market-grid .market-card').forEach(card=>{
      const visible=(active==='all'||card.dataset.category===active)&&(!query||card.dataset.search.includes(query));
      card.hidden=!visible;if(visible)shown++;
    });
    $('market-empty').hidden=shown!==0;
  };
  search.addEventListener('input',update);
  filterButtons.forEach(button=>button.addEventListener('click',()=>{
    active=button.dataset.filter;
    filterButtons.forEach(item=>{const on=item===button;item.classList.toggle('active',on);item.setAttribute('aria-pressed',String(on));});
    update();
  }));
}

async function share(title,text,url){
  if(navigator.share){try{await navigator.share({title,text,url});return 'Shared';}catch(error){if(error.name==='AbortError')return null;}}
  try{await navigator.clipboard.writeText(`${text}\n${url}`);return 'Copied';}
  catch{return 'Share unavailable — copy the page URL';}
}
const pageShare=$('share-page');
if(pageShare)pageShare.addEventListener('click',async()=>{
  const label=await share(document.title,document.querySelector('.share-box p')?.textContent||document.title,location.href);
  if(label){pageShare.textContent=label;setTimeout(()=>pageShare.textContent='Share this example ↗',2400);}
});
const scenarioResult=$('scenario-result');
if(scenarioResult){
  let selected=null;
  document.querySelectorAll('.scenario').forEach(button=>button.addEventListener('click',()=>{
    selected=button;
    document.querySelectorAll('.scenario').forEach(item=>{item.setAttribute('aria-expanded',String(item===button));item.querySelector('.scenario-plus').textContent=item===button?'−':'+';});
    const status=scenarioResult.querySelector('.status');
    status.className=`status ${button.dataset.answer.toLowerCase()}`;
    status.textContent=button.dataset.answer==='UNKNOWN'?'UNRESOLVED':button.dataset.answer;
    $('result-why').textContent=button.dataset.why;
    scenarioResult.hidden=false;
    scenarioResult.scrollIntoView({block:'nearest',behavior:'smooth'});
  }));
  $('share-scenario').addEventListener('click',async()=>{
    if(!selected)return;
    const text=`${selected.dataset.question} → ${selected.dataset.answer}. ${selected.dataset.why}`;
    const button=$('share-scenario');const label=await share(document.title,text,location.href);
    if(label){button.textContent=label;setTimeout(()=>button.textContent='Share this check ↗',2400);}
  });
}

const clock=$('clock-form');
if(clock){
  const now=new Date();
  const asInput=date=>date.toISOString().slice(0,16);
  $('clock-now').value=asInput(now);
  // Input wall-time values are explicitly UTC; Date.parse with Z avoids local-time drift.
  const parseUTC=value=>new Date(`${value}:00Z`);
  const pretty=date=>new Intl.DateTimeFormat('en-GB',{dateStyle:'long',timeStyle:'short',timeZone:'UTC'}).format(date)+' UTC';
  const calculate=()=>{
    const days=Number($('clock-days').value);
    const deadline=parseUTC($('clock-deadline').value);
    const reference=parseUTC($('clock-now').value);
    if(!Number.isInteger(days)||days<1||days>3650||!Number.isFinite(deadline.getTime())||!Number.isFinite(reference.getTime())){$('clock-result').textContent='Enter a valid deadline, reference time and whole-day duration.';return;}
    const start=new Date(deadline.getTime()-days*86400000);
    const hours=(start-reference)/3600000;
    const state=hours>0?`${Math.floor(hours/24)}d ${Math.floor(hours%24)}h left to start`:hours===0?'The latest start is now':`Latest start passed ${Math.floor(-hours/24)}d ${Math.floor((-hours)%24)}h ago`;
    $('clock-result').replaceChildren();
    const kicker=document.createElement('div');kicker.className='clock-kicker';kicker.textContent='LATEST POSSIBLE START';
    const heading=document.createElement('h2');heading.textContent=pretty(start);
    const note=document.createElement('p');note.textContent=hours>0?'A continuous qualifying streak must begin no later than this moment to finish by the deadline.':hours===0?'Any later start cannot complete the full streak by the deadline.':'If the streak has not already begun, it cannot finish by the deadline under these assumptions.';
    const grid=document.createElement('div');grid.className='clock-result-grid';
    const first=document.createElement('div');const firstLabel=document.createElement('span');firstLabel.className='clock-kicker';firstLabel.textContent='STATUS';const firstValue=document.createElement('strong');firstValue.textContent=state;first.append(firstLabel,firstValue);
    const second=document.createElement('div');const secondLabel=document.createElement('span');secondLabel.className='clock-kicker';secondLabel.textContent='REQUIRED DURATION';const secondValue=document.createElement('strong');secondValue.textContent=`${days} × 24 hours`;second.append(secondLabel,secondValue);grid.append(first,second);
    $('clock-result').append(kicker,heading,note,grid);
    const params=new URLSearchParams({deadline:$('clock-deadline').value,days:String(days)});
    history.replaceState(null,'',`${location.pathname}?${params}`);
  };
  const params=new URLSearchParams(location.search);
  if(params.has('deadline')&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(params.get('deadline'))) $('clock-deadline').value=params.get('deadline');
  if(params.has('days')&&/^\d{1,4}$/.test(params.get('days'))) $('clock-days').value=params.get('days');
  clock.addEventListener('submit',event=>{event.preventDefault();calculate();});
  calculate();
}

const receiptForm=$('receipt-form');
if(receiptForm){
  const key='jev.ruleReceipts.v1';
  const status=$('receipt-status');
  let archive=[];
  try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))archive=saved;}catch{status.textContent='Local storage could not be read.';}
  const textNode=(tag,text,className)=>{const el=document.createElement(tag);el.textContent=text;if(className)el.className=className;return el;};
  const persist=()=>localStorage.setItem(key,JSON.stringify(archive));
  const render=()=>{
    const list=$('receipt-list');list.replaceChildren();
    if(!archive.length){list.append(textNode('p','No local snapshots yet.','receipt-empty'));return;}
    for(const record of [...archive].reverse()){
      const box=document.createElement('details');box.className='receipt-record';
      const summary=document.createElement('summary');summary.textContent=`${record.label} · ${record.versions.length} version${record.versions.length===1?'':'s'}`;box.append(summary);
      if(record.url){const source=document.createElement('a');source.href=record.url;source.textContent='Source URL ↗';source.target='_blank';source.rel='noopener noreferrer';box.append(source);}
      for(let i=record.versions.length-1;i>=0;i--){
        const version=record.versions[i],previous=record.versions[i-1];
        const section=document.createElement('div');section.className='receipt-version';
        section.append(textNode('strong',new Date(version.savedAt).toLocaleString()+' · '+version.hash.slice(0,20)+'…'));
        section.append(textNode('p',previous?(previous.hash===version.hash?'Same text as previous version.':'Text changed from previous version.'):'First saved version in this browser.'));
        if(previous&&previous.hash!==version.hash){
          const comparison=document.createElement('div');comparison.className='receipt-values';
          comparison.append(textNode('pre',previous.text));comparison.append(textNode('pre',version.text));section.append(comparison);
        }else section.append(textNode('pre',version.text));
        box.append(section);
      }
      list.append(box);
    }
  };
  receiptForm.addEventListener('submit',async event=>{
    event.preventDefault();
    const label=$('receipt-label').value.trim(),source=$('receipt-url').value.trim(),rule=$('receipt-text').value.trim();
    if(!label||!rule)return;
    if(source&&!/^https:\/\//i.test(source)){status.textContent='Use an HTTPS source URL or leave the field blank.';return;}
    try{
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rule));
      const hash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      let record=archive.find(item=>item.label===label);
      if(!record){record={label,url:source,versions:[]};archive.push(record);}else if(source)record.url=source;
      if(record.versions.at(-1)?.hash===hash){status.textContent='The same text is already the latest saved version.';return;}
      if(archive.reduce((sum,item)=>sum+item.versions.length,0)>=100){status.textContent='The local archive is full. Export it before adding more.';return;}
      record.versions.push({savedAt:new Date().toISOString(),hash,text:rule});
      persist();render();status.textContent=`Saved locally · SHA-256 ${hash.slice(0,20)}…`;
    }catch(error){status.textContent=`Could not save locally: ${error.message}`;}
  });
  $('receipt-export').addEventListener('click',()=>{
    if(!archive.length){status.textContent='There is nothing to export yet.';return;}
    const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),archive},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='jev-private-rule-receipts.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  $('receipt-clear').addEventListener('click',()=>{
    if(!archive.length)return;
    if(!confirm('Delete all rule receipts stored in this browser? Export a backup first if needed.'))return;
    archive=[];localStorage.removeItem(key);render();status.textContent='Local archive cleared.';
  });
  render();
}

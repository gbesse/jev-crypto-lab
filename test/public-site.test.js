import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';

const root=new URL('../',import.meta.url);
const read=async path=>readFile(new URL(path,root),'utf8');

test('public examples stay clearly fictional and cover three distinct checks each',async()=>{
  const patterns=JSON.parse(await read('content/patterns.json'));
  assert.equal(patterns.length,10);
  for(const pattern of patterns){
    assert.match(pattern.rule,/fictional/i,pattern.slug);
    assert.equal(pattern.scenarios.length,3,pattern.slug);
    assert.equal(new Set(pattern.scenarios.map(item=>item.question)).size,3,pattern.slug);
    for(const scenario of pattern.scenarios){
      assert.ok(['YES','NO','UNKNOWN'].includes(scenario.answer));
      assert.ok(scenario.why.length>20);
    }
    const html=await read(`docs/patterns/${pattern.slug}.html`);
    assert.match(html,/ORIGINAL FICTIONAL CONTRACT/);
    assert.match(html,/not copied from an exchange/i);
    await access(new URL(`docs/social/${pattern.slug}.png`,root));
  }
});

test('all internal public-site links resolve to committed pages or assets',async()=>{
  const patterns=JSON.parse(await read('content/patterns.json'));
  const pages=['docs/index.html','docs/last-possible-yes.html','docs/receipts.html',...patterns.map(item=>`docs/patterns/${item.slug}.html`)];
  for(const page of pages){
    const html=await read(page);
    assert.match(html,/<link rel="canonical" href="https:\/\/gbesse\.github\.io\/jev-crypto-lab\//);
    assert.match(html,/<meta property="og:image"/);
    for(const [,target] of html.matchAll(/href="(\/jev-crypto-lab\/[^"#?]*)/g)){
      const relative=target.slice('/jev-crypto-lab/'.length);
      if(relative)await access(new URL(`docs/${relative}`,root));
    }
  }
});

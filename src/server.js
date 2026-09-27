import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {analyzeContracts} from './contracts.js';
import {analyzeResolution} from './resolution.js';
import {analyzeExposure} from './exposure.js';
import {judge} from './jev.js';
import {discoverMarkets,discoverProtocols} from './sources.js';
import {createMemory,snapshot,compareSnapshots,positionImpact} from './memory.js';

const root=new URL('../',import.meta.url);
export function createApp({memory=createMemory()}={}){
  let jevBusy=false;
  return createServer(async(req,res)=>{
    const headers={'X-Content-Type-Options':'nosniff','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'"};
    const send=(status,data,type='application/json')=>{res.writeHead(status,{...headers,'Content-Type':type});res.end(type==='application/json'?JSON.stringify(data):data);};
    const host=req.headers.host||'';
    if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)){send(403,{error:'Hôte local requis'});return;}
    if(req.headers.origin&&req.headers.origin!==`http://${host}`){send(403,{error:'Origine refusée'});return;}
    const path=new URL(req.url,`http://${host}`).pathname;
    try{
      if(req.method==='GET'){
        if(path==='/api/status'){send(200,{jevConfigured:Boolean(process.env.TYPESAFE_API_KEY),model:process.env.JEV_MODEL||'jev-1.13.0',mode:'read-only'});return;}
        if(path==='/api/demo'){send(200,JSON.parse(await readFile(new URL('data/demo.json',root),'utf8')));return;}
        if(path==='/api/discover/markets'){send(200,await discoverMarkets());return;}
        if(path==='/api/discover/protocols'){send(200,await discoverProtocols());return;}
        if(path==='/api/memory'){send(200,await memory.view());return;}
        if(path==='/api/memory/demo'){
          const demo=JSON.parse(await readFile(new URL('data/memory-demo.json',root),'utf8'));
          const snapshots=demo.versions.map(x=>snapshot(x.market,x.observedAt));
          const change=compareSnapshots(snapshots[0],snapshots[1]);
          send(200,{demo:true,marketIds:['900001'],positions:demo.positions,latest:[snapshots[1]],snapshots,changes:[{...change,review:null,impact:positionImpact(change,demo.positions)}],reviews:[],run:{running:false,lastRun:snapshots[1].observedAt,lastError:null},intervalMinutes:15,notice:'Exemple entièrement fictif et non archivé.'});return;
        }
        const files={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};
        if(Object.hasOwn(files,path)){send(200,await readFile(new URL(`public/${files[path]}`,root)),path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html; charset=utf-8');return;}
      }
      if(req.method==='POST'&&['/api/contracts','/api/resolution','/api/exposure','/api/judge','/api/memory/add','/api/memory/remove','/api/memory/position','/api/memory/review','/api/memory/capture','/api/memory/judge'].includes(path)){
        if(req.headers['content-type']!=='application/json'){send(415,{error:'JSON requis'});return;}
        const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>1e6){send(413,{error:'Fichier trop grand (1 Mo maximum)'});return;}chunks.push(chunk);}
        const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if(path==='/api/contracts'){send(200,analyzeContracts(input));return;}
        if(path==='/api/resolution'){send(200,analyzeResolution(input));return;}
        if(path==='/api/exposure'){send(200,analyzeExposure(input));return;}
        if(path==='/api/memory/add'){send(200,await memory.add(input.marketId));return;}
        if(path==='/api/memory/remove'){send(200,await memory.remove(input.marketId));return;}
        if(path==='/api/memory/position'){send(200,await memory.setPosition(input));return;}
        if(path==='/api/memory/review'){send(200,await memory.review(input));return;}
        if(path==='/api/memory/capture'){send(200,await memory.capture());return;}
        if(path==='/api/memory/judge'){
          if(jevBusy){send(429,{error:'Un jugement Jev est déjà en cours'});return;}
          const pair=await memory.getPair(input.changeId);
          if(!pair){send(404,{error:'Changement introuvable'});return;}
          const relevant=s=>JSON.stringify(Object.fromEntries(['question','description','resolutionSource','endDate','eventStartTime','eventEndTime','outcomes','marketType','negRisk','cryptoMarketConfig'].map(k=>[k,s.fields[k]])));
          jevBusy=true;try{send(200,await judge({task:'rule_change',before:relevant(pair.before),after:relevant(pair.after)}));}finally{jevBusy=false;}return;
        }
        if(jevBusy){send(429,{error:'Un jugement Jev est déjà en cours'});return;}
        jevBusy=true;try{send(200,await judge(input));}finally{jevBusy=false;}return;
      }
      send(404,{error:'Route inconnue'});
    }catch(error){send(400,{error:error instanceof SyntaxError?'JSON invalide':error.message==='fetch failed'?'Connexion à la source impossible. Aucun résultat simulé ne remplace cette erreur.':error.message});}
  });
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const port=Number(process.env.PORT||4317);
  const memory=createMemory();
  const server=createApp({memory});server.listen(port,'127.0.0.1',()=>console.log(`Jev Crypto Lab → http://127.0.0.1:${port}`));
  memory.view().then(state=>{if(state.marketIds.length)memory.capture().catch(()=>{});}).catch(()=>{});
  const timer=setInterval(()=>{memory.view().then(state=>{if(state.marketIds.length)memory.capture().catch(()=>{});}).catch(()=>{});},15*60*1000);
  timer.unref();
}

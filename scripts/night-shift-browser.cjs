// Isolated UI regression harness. Chat events are simulated; no AI is called.
const {spawn}=require('node:child_process');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const WebSocket=require('G:/servervroom/node_modules/ws');
const out='G:/ALTTER-Repair/altter-plan-artifacts';fs.mkdirSync(out,{recursive:true});
const phase=process.argv[2]||'before';
const edge=spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=9340','--user-data-dir='+out+'/edge-profile','about:blank'],{windowsHide:true,stdio:'ignore'});
const pause=ms=>new Promise(r=>setTimeout(r,ms));let ws;
(async()=>{
 let targets;for(let i=0;i<40;i++){try{targets=await(await fetch('http://127.0.0.1:9340/json')).json();if(targets.some(t=>t.type==='page'))break;}catch{}await pause(250);}
 ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let seq=0;const pending=new Map(),errors=[];
 ws.on('message',data=>{const m=JSON.parse(data);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const realFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(input==='/api/chat'){return Promise.resolve(new Response(new ReadableStream({start(c){const emit=(event,data)=>c.enqueue(new TextEncoder().encode('event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));emit('activity',{text:'PowerShell: "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -NoProfile -Command "git status --short"'});emit('activity',{text:'PowerShell: "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -NoProfile -Command "npm run build"'});}}),{headers:{'content-type':'text/event-stream'}}));}return realFetch(input,init);};`});
 await send('Page.navigate',{url:'http://127.0.0.1:4317'});await pause(2500);
 fs.writeFileSync(out+'/'+phase+'-initial.txt',await evaluate('document.body.innerText'));
 // Finish onboarding using the same settings endpoint as the UI (no provider check).
 await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({onboarded:true,language:'pl'})});})()`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:4317/#/chat/new'});await send('Page.reload');await pause(2000);
 fs.writeFileSync(out+'/'+phase+'-chat.txt',await evaluate('document.body.innerText'));
 const filled=await evaluate(`(()=>{const t=document.querySelector('textarea');if(!t)return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'SprawdÅº projekt');t.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);assert.ok(filled,'chat textarea');await pause(300);
 await evaluate(`document.querySelector('textarea').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',bubbles:true}))`);await pause(1500);
 const results=[];
 for(const width of [360,390,768,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(350);
  const result=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,steps:[...document.querySelectorAll('.step')].map(x=>x.innerText),elapsed:document.querySelector('.live-elapsed')?getComputedStyle(document.querySelector('.live-elapsed')).whiteSpace:null,details:document.querySelectorAll('.tool-detail').length})`);
  assert.ok(result.steps.length,'simulated tool events rendered');assert.ok(result.scroll<=width+1,'no page overflow');
  if(phase==='after'){assert.equal(result.details,2);assert.equal(result.elapsed,'nowrap');assert.ok(result.steps[0].includes('git status'));assert.ok(!result.steps[0].includes('System32'));}
  fs.writeFileSync(out+'/'+phase+'-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));results.push(result);
 }
 if(phase==='after'){await evaluate(`document.querySelector('.tool-detail summary').click()`);assert.ok(await evaluate(`document.querySelector('.tool-detail').open && document.querySelector('.tool-detail pre').innerText.includes('System32')`));}
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/'+phase+'-results.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({phase,results,errors}));await send('Browser.close');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{ws?.close();edge.kill()});


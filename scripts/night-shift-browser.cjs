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
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text);return r.result.value;};
 await send('Runtime.enable');await send('Page.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`const realFetch=window.fetch.bind(window);window.fetch=(input,init)=>{if(input==='/api/chat'){return Promise.resolve(new Response(new ReadableStream({start(c){const emit=(event,data)=>c.enqueue(new TextEncoder().encode('event: '+event+'\\ndata: '+JSON.stringify(data)+'\\n\\n'));emit('activity',{text:'PowerShell: "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -NoProfile -Command "git status --short"'});emit('activity',{text:'PowerShell: "C:\\\\Windows\\\\System32\\\\WindowsPowerShell\\\\v1.0\\\\powershell.exe" -NoProfile -Command "npm run build"'});}}),{headers:{'content-type':'text/event-stream'}}));}return realFetch(input,init);};`});
 await send('Page.navigate',{url:'http://127.0.0.1:4317'});await pause(2500);
 fs.writeFileSync(out+'/'+phase+'-initial.txt',await evaluate('document.body.innerText'));
 if(phase.startsWith('error-')) {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`location.hash='/chat/new'`);await pause(700);
  await evaluate(`(()=>{const original=window.fetch;window.__errorAttempts=0;window.fetch=(url,init)=>{if(url==='/api/chat'){window.__errorAttempts++;return Promise.resolve(Response.json({error:'Test: AI unavailable'},{status:503}));}return original(url,init);};const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Keep this task after a connection failure');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(200);
  await evaluate(`(()=>{const t=document.querySelector('textarea');t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));t.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));})()`);await pause(700);
  const result=await evaluate(`({attempts:window.__errorAttempts,draft:document.querySelector('textarea').value,visibleError:document.body.innerText.includes('Test: AI unavailable'),busy:!!document.querySelector('.live-status')})`);
  fs.writeFileSync(out+'/'+phase+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(phase==='error-after'){assert.equal(result.attempts,1);assert.equal(result.draft,'Keep this task after a connection failure');assert.equal(result.busy,false);assert.equal(result.visibleError,true);}
  fs.writeFileSync(out+'/'+phase+'-results.json',JSON.stringify({result,errors}));console.log(JSON.stringify({phase,result,errors}));await send('Browser.close');return;
 }
 if(phase==='page') {
  const file='G:/ALTTER-Repair/altter-plan-test-data/workspace/page-demo.html';fs.copyFileSync('examples/night-shift/page-demo.html',file);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`location.hash='/chat/night-shift-page-preview'`);await pause(1200);
  await evaluate(`[...document.querySelectorAll('.bubble button')].find(b=>b.textContent.includes('page-demo.html')).click()`);await pause(1600);
  assert.ok(await evaluate(`!!document.querySelector('.preview-pane iframe')`));
  await evaluate(`[...document.querySelectorAll('.preview-head button')].find(b=>b.textContent.includes('Wskaż element')).click()`);await pause(300);
  const frameEval=async expression=>{const target=(await send('Target.getTargets')).targetInfos.find(t=>t.type==='iframe'&&t.url.includes('/preview/'));assert.ok(target,'sandboxed preview iframe target');const {sessionId}=await send('Target.attachToTarget',{targetId:target.targetId,flatten:true});return (await send('Runtime.evaluate',{expression,returnByValue:true},sessionId)).result.value;};
  await frameEval(`document.querySelector('#hero-title').click()`);await pause(400);
  assert.ok(await evaluate(`!!document.querySelector('.pick-chip[title="#hero-title"]')`),'real selected heading reaches the composer');
  fs.writeFileSync(out+'/page-picked.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  fs.writeFileSync(file,fs.readFileSync(file,'utf8').replace('Twoja następna trasa zaczyna się tutaj.','Wyrusz w nową trasę z VROOM.'));
  await evaluate(`document.querySelector('.preview-head button[title="Odśwież"]').click()`);await pause(1000);
  const heading=await frameEval(`document.querySelector('#hero-title').innerText`);
  assert.equal(heading,'Wyrusz w nową trasę z VROOM.');fs.writeFileSync(out+'/page-edited.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  fs.writeFileSync(out+'/page-results.json',JSON.stringify({selected:'#hero-title',heading,errors}));assert.deepEqual(errors,[]);console.log('Saved answer → page preview → selected heading → edited file refresh: OK (no AI)');await send('Browser.close');return;
 }
 if(phase==='workspace-skills') {
  const ids=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};const projects=await(await fetch('/api/projects',{headers})).json();const project=projects.find(p=>p.name.startsWith('Night shift workspace'));const agents=await(await fetch('/api/agents',{headers})).json();const agent=agents.find(a=>a.name==='Night shift skill demo');await fetch('/api/agents/'+agent.id,{method:'PUT',headers,body:JSON.stringify({projectId:project.id})});return {project:project.id,agent:agent.id};})()`);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`sessionStorage.setItem('altter.wsView','chat');location.hash='/workspace/${ids.project}'`);await send('Page.reload');await pause(1400);
  await evaluate(`document.querySelectorAll('.ws-tabs button')[1].click()`);await pause(500);
  const openAgent=async()=>{await evaluate(`[...document.querySelectorAll('.ws-row')].find(x=>x.textContent.includes('Night shift skill demo')).click()`);await pause(600);};
  await openAgent();await evaluate(`document.querySelector('.ac-instr summary').click()`);await pause(200);
  await evaluate(`[...document.querySelectorAll('.ac-instr button')].find(b=>b.textContent.includes('Edytuj')).click()`);await pause(200);
  assert.ok(await evaluate(`!!document.querySelector('.ac .github-skills')`),'GitHub installer reachable inside workspace');
  await evaluate(`document.querySelector('.ac .github-skills summary').click()`);await pause(200);
  fs.writeFileSync(out+'/workspace-skills-390.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await evaluate(`document.querySelector('.ac .github-skills summary').click()`);
  for(const selected of [false,true]){
   await evaluate(`(()=>{const b=[...document.querySelectorAll('.ac-instr button.badge')].find(b=>b.textContent==='webapp-testing');if((b.getAttribute('aria-pressed')==='true')!==${selected})b.click();})()`);await pause(100);
   await evaluate(`[...document.querySelectorAll('.ac-instr button')].find(b=>b.textContent==='Zapisz').click()`);await pause(400);
   const saved=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();return (await(await fetch('/api/agents',{headers:{Authorization:'Bearer '+token}})).json()).find(a=>a.id==='${ids.agent}').skills;})()`);assert.equal(saved.some(s=>s.startsWith('github-anthropics-skills')),selected);
   if(!selected){await evaluate(`Array.from(document.querySelectorAll('.ac-instr button')).find(b=>b.textContent.includes('Edytuj')).click()`);await pause(200);}
  }
  await evaluate(`(()=>{const t=document.querySelector('.ac-compose textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Agent task draft');t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(150);
  await evaluate(`document.querySelector('.drawer-close').click()`);await pause(500);await openAgent();assert.equal(await evaluate(`document.querySelector('.ac-compose textarea').value`),'Agent task draft');
  assert.deepEqual(errors,[]);fs.writeFileSync(out+'/workspace-skills-results.json',JSON.stringify({ids,assignmentSaved:true,draftRestored:true,errors}));console.log('Workspace skill assignment and agent draft: OK');await send('Browser.close');return;
 }
 if(phase.startsWith('media-')) {
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`location.hash='/studio'`);await pause(1800);
  await evaluate(`[...document.querySelectorAll('.render-tile')].find(x=>x.textContent.includes('night-vroom.wav')).click()`);await pause(600);
  const audio=await evaluate(`({audio:!!document.querySelector('.lightbox audio'),brokenImage:!!document.querySelector('.lightbox img')&&!document.querySelector('.lightbox img').naturalWidth})`);
  fs.writeFileSync(out+'/'+phase+'-audio.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(phase==='media-after')assert.equal(audio.audio,true);else assert.equal(audio.brokenImage,true);
  await evaluate(`document.querySelector('.lightbox').click()`);await pause(400);
  await evaluate(`[...document.querySelectorAll('.render-tile')].find(x=>x.textContent.includes('night-vroom-project.mp4')).click()`);await pause(1000);
  const video=await evaluate(`(async()=>{const v=document.querySelector('.lightbox video');v.muted=true;await v.play();v.currentTime=1.5;return {width:v.videoWidth,height:v.videoHeight,duration:v.duration};})()`);await pause(600);
  assert.equal(video.width,1080);assert.equal(video.height,1920);assert.ok(await evaluate(`document.querySelector('.lightbox video').currentTime>1.5`));
  fs.writeFileSync(out+'/'+phase+'-video.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  if(phase==='media-after') {
   const back=await evaluate(`(()=>{const b=[...document.querySelectorAll('.lightbox button')].find(b=>b.textContent.includes('Night shift workspace'));if(!b)return false;b.click();return true;})()`);assert.ok(back);await pause(500);assert.ok(await evaluate(`location.hash.startsWith('#/workspace/')`));
   await evaluate(`location.hash='/studio'`);await pause(600);await evaluate(`document.querySelector('.render-tile').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);await pause(500);assert.ok(await evaluate(`!!document.querySelector('.lightbox')`));await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);await pause(1000);assert.ok(await evaluate(`!document.querySelector('.lightbox')`));
  }
  fs.writeFileSync(out+'/'+phase+'-results.json',JSON.stringify({audio,video,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({phase,audio,video,errors}));await send('Browser.close');return;
 }
 if(phase==='tour') {
  const fixture=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};const call=async(path,body)=>{const r=await fetch(path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})});if(!r.ok)throw Error(path+' '+r.status);return r.json();};const projects=await call('/api/projects');let p=projects.find(p=>p.name.startsWith('Night shift workspace'));if(!p){p=await call('/api/projects',{name:'Night shift workspace — long project name for navigation and layout checks',description:'Isolated local test data'});for(let i=0;i<8;i++)await call('/api/ws/tasks?project='+p.id,{title:'Task '+i+' — a deliberately long title to check wrapping and controls',description:'Test fixture',status:'todo'});await call('/api/ws/docs?project='+p.id,{title:'Long document title for the local workspace regression',body:'# Test document\\n\\nA saved document visible in the workspace.'});await call('/api/ws/chats?project='+p.id,{title:'Local test conversation'});}let empty=projects.find(p=>p.name==='Night shift empty');if(!empty)empty=await call('/api/projects',{name:'Night shift empty'});return {project:p.id,empty:empty.id};})()`);
  const results=[];
  for(const width of [360,390,768,1440]) {
   await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   for(const [name,route] of [['home','/'],['projects','/projects'],['workspace-list','/workspace'],['empty','/workspace/'+fixture.empty],['workspace','/workspace/'+fixture.project],['studio','/studio']]) {
    await evaluate(`location.hash=${JSON.stringify(route)}`);await pause(550);
    const result=await evaluate(`({width:innerWidth,scroll:document.documentElement.scrollWidth,text:document.body.innerText.slice(0,180),buttons:document.querySelectorAll('button').length})`);assert.ok(result.buttons>0,name+' renders');
    fs.writeFileSync(out+'/tour-'+name+'-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));results.push({name,...result});
   }
  }
  await evaluate(`location.hash='/workspace/${fixture.project}'`);await pause(500);
  const tabs=await evaluate(`[...document.querySelectorAll('.ws-nav button')].map(x=>x.textContent)`);
  for(let i=0;i<tabs.length;i++){await evaluate(`document.querySelectorAll('.ws-nav button')[${i}].click()`);await pause(450);fs.writeFileSync(out+'/workspace-tab-'+i+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  fs.writeFileSync(out+'/tour-results.json',JSON.stringify({fixture,results,tabs,errors},null,2));console.log(JSON.stringify({screens:results.length,tabs,overflow:results.filter(r=>r.scroll>r.width+1).map(r=>({name:r.name,width:r.width,scroll:r.scroll})),errors}));assert.deepEqual(errors,[]);await send('Browser.close');return;
 }
 if(phase==='skills') {
  const agentId=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();const headers={'Content-Type':'application/json',Authorization:'Bearer '+token};const all=await(await fetch('/api/agents',{headers})).json();const old=all.find(a=>a.name==='Night shift skill demo');if(old)return old.id;return (await(await fetch('/api/agents',{method:'POST',headers,body:JSON.stringify({name:'Night shift skill demo',instructions:'Use the assigned skill to test a local web app.',schedule:'manual',enabled:false,learns:false,access:'read'})})).json()).id;})()`);
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate(`location.hash='/agents'`);await send('Page.reload');await pause(1800);
  await evaluate(`[...document.querySelectorAll('.card')].find(x=>x.textContent.includes('Night shift skill demo')).click()`);await pause(600);
  await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Edytuj').click()`);await pause(500);
  await evaluate(`document.querySelector('.github-skills summary').click()`);await pause(200);
  const fill=async (index,value)=>{await evaluate(`(()=>{const t=document.querySelectorAll('.github-skills input')[${index}];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(t,${JSON.stringify(value)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(200);};
  const click=async text=>{assert.ok(await evaluate(`(()=>{const b=[...document.querySelectorAll('.github-skills button')].find(x=>x.textContent===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true;})()`));};
  const wait=async expression=>{for(let i=0;i<100;i++){if(await evaluate("Boolean("+expression+")"))return;await pause(300);}throw Error('Timed out: '+expression+' '+await evaluate(`document.querySelector('.github-skills')?.innerText`));};
  await fill(0,'anthropics');await click('Szukaj repozytoriów');await wait(`document.querySelector('.github-repository') || document.querySelector('.github-skill-error')`);
  assert.ok(await evaluate(`document.querySelectorAll('.github-repository').length>0`),'real repository search results');
  await fill(1,'https://github.com/anthropics/skills');await click('Podgląd');await wait(`document.querySelector('.github-skills select')`);
  const choices=await evaluate(`document.querySelector('.github-skills select').options.length`);assert.ok(choices>2,'multiple packages');
  await evaluate(`(()=>{const s=document.querySelector('.github-skills select');s.value='skills/webapp-testing/SKILL.md';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await wait(`document.querySelector('.github-skill-preview')`);
  const preview=await evaluate(`({text:document.querySelector('.github-skill-preview').innerText,sha:document.querySelector('.github-skills .mono').innerText})`);assert.ok(preview.text.includes('Playwright'));
  for(const width of [360,390,768,1440]){await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await pause(200);await evaluate(`document.querySelector('.github-skills').scrollIntoView()`);assert.ok(await evaluate(`document.documentElement.scrollWidth<=innerWidth+1`));fs.writeFileSync(out+'/skills-'+width+'.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));}
  const installed=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();return (await(await fetch('/api/skills',{headers:{Authorization:'Bearer '+token}})).json()).find(s=>s.source?.path==='skills/webapp-testing/SKILL.md');})()`);
  if(!installed){await click('Zainstaluj i zaznacz');await wait(`!document.querySelector('.github-skills').open`);}else{await evaluate(`[...document.querySelectorAll('button.badge')].find(b=>b.textContent.includes('webapp-testing') && b.getAttribute('aria-pressed')!=='true')?.click()`);}
  await evaluate(`document.querySelector('.modal-foot button').click()`);await pause(800);
  const saved=await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();return (await(await fetch('/api/agents',{headers:{Authorization:'Bearer '+token}})).json()).find(a=>a.id===${JSON.stringify(agentId)});})()`);assert.ok(saved.skills.some(s=>s.startsWith('github-anthropics-skills')));
  await send('Page.reload');await pause(1000);
  fs.writeFileSync(out+'/skills-results.json',JSON.stringify({agentId,choices,preview,assigned:saved.skills,errors},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({agentId,choices,assigned:saved.skills,errors}));await send('Browser.close');return;
 }
 // Finish onboarding using the same settings endpoint as the UI (no provider check).
 await evaluate(`(async()=>{const {token}=await(await fetch('/api/boot')).json();await fetch('/api/settings',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({onboarded:true,language:'pl'})});})()`);
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:4317/#/chat/new'});await send('Page.reload');await pause(2000);
 fs.writeFileSync(out+'/'+phase+'-chat.txt',await evaluate('document.body.innerText'));
 const enter=async text=>{await evaluate(`(()=>{const t=document.querySelector('textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,${JSON.stringify(text)});t.dispatchEvent(new Event('input',{bubbles:true}));})()`);await pause(150);};
 await enter('Draft stays with this chat');
 await evaluate(`location.hash='/settings'`);await pause(500);
 await evaluate(`location.hash='/chat/new'`);await pause(700);
 const restored=await evaluate(`document.querySelector('textarea')?.value`);
 await send('Page.reload');await pause(1500);
 const reloaded=await evaluate(`document.querySelector('textarea')?.value`);
 fs.writeFileSync(out+'/'+phase+'-drafts.json',JSON.stringify({restored,reloaded}));
 if(phase==='after'){assert.equal(restored,'Draft stays with this chat');assert.equal(reloaded,'Draft stays with this chat');}
 if(phase==='after') {
  await send('Network.enable');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await pause(500);
  assert.equal(await evaluate(`navigator.onLine`),false);
  assert.ok(await evaluate(`document.querySelector('.network-status')?.textContent.includes('Brak połączenia')`));
  await enter('Offline draft survives');
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:false});
  fs.writeFileSync(out+'/offline-390.png',Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await pause(600);
  assert.ok(await evaluate(`!document.querySelector('.network-status')`));assert.equal(await evaluate(`document.querySelector('textarea').value`),'Offline draft survives');
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 }
 const filled=await evaluate(`(()=>{const t=document.querySelector('textarea');if(!t)return false;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(t,'Sprawdź projekt');t.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);assert.ok(filled,'chat textarea');await pause(300);
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


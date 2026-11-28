// Run only against the isolated test data. Uses one render worker on this VPS.
const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');
const data='G:/ALTTER-Repair/altter-plan-test-data', studio=path.join(data,'studio');
fs.mkdirSync(path.join(studio,'public'),{recursive:true});
const rate=22050,seconds=6,count=rate*seconds,pcm=Buffer.alloc(count*2),notes=[261.63,329.63,392,523.25,392,329.63];
for(let i=0;i<count;i++){const t=i/rate,local=t%1,fade=Math.min(1,local*20,(1-local)*8);pcm.writeInt16LE(Math.round(Math.sin(2*Math.PI*notes[Math.floor(t)]*t)*0.25*fade*32767),i*2);}
const wav=Buffer.alloc(44);wav.write('RIFF');wav.writeUInt32LE(36+pcm.length,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(pcm.length,40);
fs.writeFileSync(path.join(studio,'public/night-vroom.wav'),Buffer.concat([wav,pcm]));
const render=fs.readFileSync(path.join(studio,'render.mjs'),'utf8');
if(!render.includes('await renderMedia({'))throw Error('Unexpected renderer version');
const runner=path.join(studio,'night-shift-render.mjs');
fs.writeFileSync(runner,render.replace('await renderMedia({','await renderMedia({\n      concurrency: 1,'));
const child=spawn(process.execPath,[runner,'videos/night-vroom.tsx','--out','renders/night-vroom.mp4'],{cwd:path.join(data,'workspace'),windowsHide:true,stdio:'inherit'});
child.on('exit',code=>{process.exitCode=code??1});

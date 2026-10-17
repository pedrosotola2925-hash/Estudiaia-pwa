const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawn,execFile}=require('node:child_process');const core=require('../shared/core.js');const {id}=require('./security.cjs');const {VOICES}=require('./settings.cjs');
const fail=code=>Object.assign(new Error(code),{code});
function createVoiceService({cacheDir,helperPath,spawnImpl=spawn,clock=Date.now,timeoutMs=60000}){
 const active=new Map();
 function prune(){const entries=fs.readdirSync(cacheDir).filter(n=>/^[a-f0-9]{64}\.mp3$/.test(n)).map(n=>({file:path.join(cacheDir,n),stat:fs.statSync(path.join(cacheDir,n))})).sort((a,b)=>a.stat.mtimeMs-b.stat.mtimeMs);let size=entries.reduce((n,e)=>n+e.stat.size,0);while(entries.length>50||size>100*1024*1024){const e=entries.shift();size-=e.stat.size;fs.unlinkSync(e.file);}}
 function validAudio(bytes){return bytes.length>=32&&bytes.length<=10*1024*1024&&(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224));}
 return {
  async speak(req){id(req?.id);const text=core.requireText(req?.text);if(!VOICES.includes(req.voice)||!Number.isInteger(req.rate)||req.rate< -50||req.rate>50)throw core.invalid();if(active.has(req.id)||active.size>=2)throw fail('BUSY');fs.mkdirSync(cacheDir,{recursive:true});const hash=crypto.createHash('sha256').update(JSON.stringify([text,req.voice,req.rate,'v1'])).digest('hex'),target=path.join(cacheDir,hash+'.mp3');if(fs.existsSync(target)){const audio=fs.readFileSync(target);if(validAudio(audio)){const now=new Date(clock());fs.utimesSync(target,now,now);return {base64:audio.toString('base64'),mime:'audio/mpeg'};}fs.unlinkSync(target);}
   if(!fs.existsSync(helperPath))throw fail('NO_AUDIO');const temp=path.join(cacheDir,'tmp-'+crypto.randomUUID()+'.mp3');
   return new Promise((resolve,reject)=>{let child,settled=false,timer,stdout='';
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);active.delete(req.id);try{if(error)throw error;const result=JSON.parse(stdout);if(!result.ok||result.path!==temp)throw fail('NO_AUDIO');const bytes=fs.readFileSync(temp);if(!validAudio(bytes))throw fail('NO_AUDIO');fs.renameSync(temp,target);prune();resolve({base64:bytes.toString('base64'),mime:'audio/mpeg'});}catch(e){reject(e.code&&['CANCELLED','TIMEOUT','NO_AUDIO'].includes(e.code)?e:fail('NO_AUDIO'));}finally{try{fs.unlinkSync(temp);}catch{}}};
    const stop=code=>{if(settled)return;if(process.platform==='win32'&&child?.pid){execFile('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true},()=>{try{fs.unlinkSync(temp);}catch{}});}else child?.kill();finish(fail(code));};
    try{child=spawnImpl(helperPath,[],{shell:false,windowsHide:true,stdio:['pipe','pipe','pipe']});active.set(req.id,{stop});timer=setTimeout(()=>stop('TIMEOUT'),timeoutMs);child.on('error',()=>finish(fail('NO_AUDIO')));child.on('close',code=>finish(code===0?null:fail('NO_AUDIO')));child.stdout.on('data',b=>{stdout+=b.toString();if(stdout.length>32768)stop('NO_AUDIO');});child.stderr.on('data',()=>{});child.stdin.on('error',()=>finish(fail('NO_AUDIO')));child.stdin.end(JSON.stringify({text,voice:req.voice,rate:req.rate,outputPath:temp}));}catch{finish(fail('NO_AUDIO'));}
   });
  },
  cancel(requestId){active.get(requestId)?.stop('CANCELLED');},close(){for(const job of [...active.values()])job.stop('CANCELLED');}
 };
}
module.exports={createVoiceService};

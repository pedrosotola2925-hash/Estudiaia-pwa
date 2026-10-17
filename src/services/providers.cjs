const crypto=require('node:crypto');const core=require('../shared/core.js');const {validateAIRequest,id}=require('./security.cjs');const {buildPrompt}=require('./prompts.cjs');
const fail=code=>Object.assign(new Error(code),{code});
function delay(ms,signal){return new Promise((resolve,reject)=>{if(signal.aborted)return reject(fail('CANCELLED'));const stop=()=>{clearTimeout(timer);reject(fail('CANCELLED'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',stop);resolve();},ms);signal.addEventListener('abort',stop,{once:true});});}
function createProviderService({settings,fetchImpl=fetch,timeoutMs=45000}){
 const active=new Map();
 async function run(requestId,fn){id(requestId);if(active.has(requestId)||active.size>=6)throw fail('BUSY');const controller=new AbortController();active.set(requestId,controller);try{const value=await fn(controller.signal);if(controller.signal.aborted)throw fail('CANCELLED');return value;}finally{active.delete(requestId);}}
 function key(provider){const value=settings.getSecret(provider);if(!value)throw fail('NO_KEY');return value;}
 async function request(url,options,signal){
  for(let attempt=0;attempt<3;attempt++){
   if(signal.aborted)throw fail('CANCELLED');const child=new AbortController();let timeout=false;
   const abort=()=>child.abort();signal.addEventListener('abort',abort,{once:true});const timer=setTimeout(()=>{timeout=true;child.abort();},timeoutMs);let response;
   try{response=await fetchImpl(url,{...options,signal:child.signal});if(signal.aborted)throw fail('CANCELLED');if(timeout)throw fail('TIMEOUT');
    if(response.ok){let data;try{data=await response.json();}catch{if(signal.aborted)throw fail('CANCELLED');if(timeout)throw fail('TIMEOUT');throw fail('INVALID_FORMAT');}if(signal.aborted)throw fail('CANCELLED');return data;}
   }catch(e){if(signal.aborted)throw fail('CANCELLED');if(timeout)throw fail('TIMEOUT');if(['INVALID_FORMAT','CANCELLED','TIMEOUT'].includes(e.code))throw e;throw fail('NETWORK');}
   finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
   if(response.status===429){const header=response.headers.get('retry-after');let seconds=header===null?2**(attempt+1):Number(header);if(!Number.isFinite(seconds))seconds=Math.max(0,(Date.parse(header)-Date.now())/1000);if(!Number.isFinite(seconds))seconds=2;if(attempt===2||seconds>60)throw fail('QUOTA');await delay(Math.max(0,seconds)*1000,signal);continue;}
   if([401,403].includes(response.status))throw fail('AUTH');if(response.status===404)throw fail('MODEL');throw fail('NETWORK');
  }
  throw fail('QUOTA');
 }
 return {
  generate(raw){const req=validateAIRequest(raw);return run(req.id,async signal=>{const apiKey=key('gemini'),model=settings.getSummary().model;const prompt=buildPrompt(req),parts=[{text:prompt.text}];if(req.file)parts.push({inlineData:{mimeType:req.file.mime,data:req.file.base64}});const body={systemInstruction:{parts:[{text:prompt.system}]},contents:[{role:'user',parts}],generationConfig:{maxOutputTokens:4096,...(prompt.json?{responseMimeType:'application/json'}:{})}};
   const d=await request(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)},signal);
   if(d?.promptFeedback?.blockReason||['SAFETY','BLOCKLIST','PROHIBITED_CONTENT'].includes(d?.candidates?.[0]?.finishReason))throw fail('BLOCKED');const p=d?.candidates?.[0]?.content?.parts;if(!Array.isArray(p))throw fail('INVALID_FORMAT');const text=p.filter(v=>typeof v?.text==='string'&&!v.thought).map(v=>v.text).join('\n').trim();if(!text||text.length>20000)throw fail('INVALID_FORMAT');return {text};});},
  searchVideos(req){id(req?.id);const query=core.requireText(req?.query,1000);return run(req.id,async signal=>{const url=new URL('https://www.googleapis.com/youtube/v3/search');url.search=new URLSearchParams({part:'snippet',type:'video',maxResults:'4',safeSearch:'strict',videoEmbeddable:'true',q:query,key:key('youtube')});const d=await request(url.toString(),{method:'GET'},signal);if(!Array.isArray(d?.items))throw fail('INVALID_FORMAT');return d.items.filter(it=>/^[A-Za-z0-9_-]{11}$/.test(it?.id?.videoId||'')&&typeof it?.snippet?.title==='string').map(it=>{let thumbnail=it.snippet.thumbnails?.medium?.url||it.snippet.thumbnails?.default?.url||'';try{const u=new URL(thumbnail);if(u.protocol!=='https:'||u.hostname!=='i.ytimg.com')thumbnail='';}catch{thumbnail='';}return {id:it.id.videoId,title:it.snippet.title.slice(0,1000),thumbnail};});});},
  checkConnection(provider){if(!['gemini','youtube'].includes(provider))return Promise.reject(fail('INVALID_FORMAT'));return run('check-'+crypto.randomUUID(),async signal=>{const apiKey=key(provider);let url,options={method:'GET'};if(provider==='gemini'){url='https://generativelanguage.googleapis.com/v1beta/models/'+encodeURIComponent(settings.getSummary().model);options.headers={'x-goog-api-key':apiKey};}else{url='https://www.googleapis.com/youtube/v3/i18nLanguages?part=snippet&key='+encodeURIComponent(apiKey);}await request(url,options,signal);return {ok:true,message:'Conexión comprobada.'};});},
  cancel(requestId){active.get(requestId)?.abort();},close(){for(const controller of active.values())controller.abort();}
 };
}
module.exports={createProviderService};

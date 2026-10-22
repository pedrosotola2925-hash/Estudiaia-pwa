const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const core=require('../shared/core.js');
const VOICES=['es-MX-DaliaNeural','es-CL-CatalinaNeural'];
const LEGACY_DEFAULT_GEMINI_MODEL='gemini-3.5-flash-lite';
const DEFAULT_GEMINI_MODEL='gemini-3.8-flash';
function createSettingsStore({directory,encrypt,decrypt,isEncryptionAvailable,fsImpl=fs}){
 const file=path.join(directory,'settings.json');const blank=()=>({version:1,model:DEFAULT_GEMINI_MODEL,voice:VOICES[0],rate:-5,secrets:{}});let state=blank();
 function validate(d){if(!d||d.version!==1||!/^gemini-[a-z0-9.-]{1,90}$/.test(d.model)||!(VOICES.includes(d.voice)||/^local:[^\x00-\x1f]{1,150}$/.test(d.voice))||!Number.isInteger(d.rate)||d.rate< -50||d.rate>50||!d.secrets||typeof d.secrets!=='object')throw core.invalid();return d;}
 for(const f of [file,file+'.backup']){try{if(fsImpl.existsSync(f)){state=validate(JSON.parse(fsImpl.readFileSync(f,'utf8')));break;}}catch{state=blank();}}
 function secret(provider){if(!['gemini','youtube'].includes(provider))throw core.invalid();if(!state.secrets[provider])return '';try{return decrypt(Buffer.from(state.secrets[provider],'base64'));}catch{return '';}}
 function summary(){return {model:state.model,voice:state.voice,rate:state.rate,hasGeminiKey:Boolean(secret('gemini')),hasYoutubeKey:Boolean(secret('youtube'))};}
 function atomic(target,data){const temp=target+'.'+crypto.randomUUID()+'.tmp';try{fsImpl.writeFileSync(temp,data,{encoding:'utf8',mode:0o600,flag:'wx'});fsImpl.renameSync(temp,target);}finally{try{fsImpl.unlinkSync(temp);}catch{}}}
 if(state.model===LEGACY_DEFAULT_GEMINI_MODEL){const migrated={...state,model:DEFAULT_GEMINI_MODEL};try{if(fsImpl.existsSync(file))atomic(file+'.backup',JSON.stringify(state));atomic(file,JSON.stringify(migrated));}catch{}state=migrated;}
 function commit(next){validate(next);fsImpl.mkdirSync(directory,{recursive:true});try{if(fsImpl.existsSync(file))atomic(file+'.backup',JSON.stringify(state));atomic(file,JSON.stringify(next));}catch{const e=new Error('No se pudo guardar.');e.code='STORAGE_ERROR';throw e;}state=next;return summary();}
 return {getSummary:summary,getSecret:secret,async save(patch){if(!patch||typeof patch!=='object'||Array.isArray(patch)||Object.keys(patch).some(k=>!['model','voice','rate','geminiKey','youtubeKey'].includes(k)))throw core.invalid();const next=structuredClone(state);for(const k of ['model','voice','rate'])if(patch[k]!==undefined)next[k]=patch[k];for(const [field,provider] of [['geminiKey','gemini'],['youtubeKey','youtube']])if(patch[field]!==undefined&&patch[field]!==''){const value=core.requireText(patch[field],2000);if(value.length<8||/\s|PEGA_AQUI/i.test(value))throw core.invalid();if(!isEncryptionAvailable()){const e=new Error('Cifrado protegido no disponible.');e.code='STORAGE_ERROR';throw e;}next.secrets[provider]=encrypt(value).toString('base64');}return commit(next);},async clearSecret(provider){if(!['gemini','youtube'].includes(provider))throw core.invalid();const next=structuredClone(state);delete next.secrets[provider];return commit(next);}};
}
module.exports={createSettingsStore,VOICES};

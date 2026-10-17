const security=require('./security.cjs');const core=require('../shared/core.js');
function registerIPC({ipcMain,settings,providers,voice,openExternal}){
 const routes={getSettings:()=>settings.getSummary(),saveSettings:p=>settings.save(p),clearKey:p=>settings.clearSecret(p),checkConnection:p=>{if(!['gemini','youtube'].includes(p))throw core.invalid();return providers.checkConnection(p);},generate:p=>providers.generate(security.validateAIRequest(p)),searchVideos:p=>providers.searchVideos({id:security.id(p?.id),query:core.requireText(p?.query,1000)}),speak:p=>voice.speak(p),cancel:id=>{security.id(id);providers.cancel(id);voice.cancel(id);},openVideo:id=>openExternal(security.videoURL(id))};
 for(const [name,handler] of Object.entries(routes))ipcMain.handle('estudia:'+name,async(event,payload)=>{if(!security.isTrustedSender(event))return {ok:false,error:{code:'FORBIDDEN',message:'Operación no permitida.'}};try{return {ok:true,value:await handler(payload)};}catch(e){return {ok:false,error:security.publicError(e)};}});
}
module.exports={registerIPC};

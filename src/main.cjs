const {app,BrowserWindow,protocol,net,session,ipcMain,safeStorage,shell}=require('electron');
const path=require('node:path');const {pathToFileURL}=require('node:url');
const {APP_URL,resolveAssetPath}=require('./services/security.cjs');const {createSettingsStore}=require('./services/settings.cjs');const {registerIPC}=require('./services/ipc.cjs');
protocol.registerSchemesAsPrivileged([{scheme:'estudiaia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setName('EstudiaIA 2');app.setPath('userData',process.env.ESTUDIAIA_TEST_USER_DATA||path.join(app.getPath('appData'),'EstudiaIA2'));app.setAppUserModelId('cl.estudiaia.desktop.v2');
if(!app.requestSingleInstanceLock()){app.quit();}else{
 let window;
 app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.focus();}});
 app.whenReady().then(()=>{
  console.log('app.whenReady resolved');
  protocol.handle('estudiaia',async req=>{
    console.log('protocol.handle called:', req.url);try{if(req.method!=='GET'&&req.method!=='HEAD')return new Response('',{status:405});const f=resolveAssetPath(req.url,__dirname);const result=await net.fetch(pathToFileURL(f).toString());const headers=new Headers(result.headers);headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://i.ytimg.com; media-src 'self' blob:; frame-src https://www.youtube-nocookie.com https://www.youtube.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");headers.set('X-Content-Type-Options','nosniff');return new Response(result.body,{status:result.status,headers});}catch{return new Response('Recurso no disponible.',{status:404});}});
  session.defaultSession.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));session.defaultSession.setPermissionCheckHandler(()=>false);
  const settings=createSettingsStore({directory:app.getPath('userData'),encrypt:s=>safeStorage.encryptString(s),decrypt:b=>safeStorage.decryptString(b),isEncryptionAvailable:()=>safeStorage.isEncryptionAvailable()});
  const {createProviderService}=require('./services/providers.cjs');const {createVoiceService}=require('./services/voice.cjs');
  const providers=createProviderService({settings});const helperPath=app.isPackaged?path.join(process.resourcesPath,'voice/tts-helper.exe'):path.join(app.getAppPath(),'build/voice/tts-helper.exe');
  const voice=createVoiceService({cacheDir:path.join(app.getPath('userData'),'voice-cache'),helperPath});
  registerIPC({ipcMain,settings,providers,voice,openExternal:url=>shell.openExternal(url)});
  app.on('before-quit',()=>{providers.close();voice.close();});
  window=new BrowserWindow({width:1120,height:780,minWidth:700,minHeight:500,title:'EstudiaIA 2',backgroundColor:'#f1f5f9',show:false,webPreferences:{preload:path.join(__dirname,'preload.cjs'),nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});
  window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));window.webContents.on('will-navigate',(e,url)=>{if(url!==APP_URL)e.preventDefault();});window.once('ready-to-show',()=>window.show());window.loadURL(APP_URL);
 }).catch(()=>{console.error('No se pudo iniciar EstudiaIA 2.');app.quit();});
 app.on('window-all-closed',()=>app.quit());
}

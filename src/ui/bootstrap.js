(()=>{'use strict';const E=window.Estudia={features:{},ready:false};const pending=new Map();E.request={async run(raw,operation='generate'){const req={...raw,id:raw.id||crypto.randomUUID()};const state={cancelled:false};pending.set(req.id,state);try{const result=await (operation==='searchVideos'?window.desktop.searchVideos(req):window.desktop.generate(req));if(state.cancelled)throw Object.assign(new Error('Cancelado'),{code:'CANCELLED'});return result;}finally{pending.delete(req.id);}},cancel(id){const state=pending.get(id);if(state)state.cancelled=true;return window.desktop.cancel(id).catch(()=>{});},cancelAll(){for(const [id,state]of pending){state.cancelled=true;window.desktop.cancel(id).catch(()=>{});}}};E.course=()=>E.store.getState().course;E.cachePut=(key,text)=>{try{E.store.putCache(key,text);}catch(e){E.ui.toast(e.message,'error');}};

// Web-compatible desktop API bridge - must initialize BEFORE init()
async function initDesktopBridge() {
  if (typeof window !== 'undefined' && !window.desktop) {
    try {
      const { getSettingsBridge } = await import('@services/settings-bridge');
      const bridge = getSettingsBridge();

      window.desktop = {
        // Settings bridge
        getSettings: () => bridge.getSettings(),
        saveSettings: (patch) => bridge.saveSettings(patch),
        clearKey: (provider) => bridge.clearKey(provider),

        // Placeholder methods for other IPC calls (implemented in later tasks)
        searchVideos: async (req) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'searchVideos not implemented yet' } }),
        generate: async (req) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'generate not implemented yet' } }),
        speak: async (req) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'speak not implemented yet' } }),
        cancel: async (id) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'cancel not implemented yet' } }),
        openVideo: async (url) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'openVideo not implemented yet' } }),
        checkConnection: async (provider) => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'checkConnection not implemented yet' } }),
      };

      // Expose password management on bridge for settings UI
      window.desktop._bridge = bridge;
    } catch (e) {
      console.error('[EstudiaIA] Failed to load desktop bridge:', e);
      // Fallback to empty object to avoid crashes
      window.desktop = {
        getSettings: async () => ({ model: 'gemini-3.5-flash-lite', voice: 'es-MX-DaliaNeural', rate: -5, hasGeminiKey: false, hasYoutubeKey: false }),
        saveSettings: async () => ({ model: 'gemini-3.5-flash-lite', voice: 'es-MX-DaliaNeural', rate: -5, hasGeminiKey: false, hasYoutubeKey: false }),
        clearKey: async () => ({ model: 'gemini-3.5-flash-lite', voice: 'es-MX-DaliaNeural', rate: -5, hasGeminiKey: false, hasYoutubeKey: false }),
        searchVideos: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Bridge not loaded' } }),
        generate: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Bridge not loaded' } }),
        speak: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Bridge not loaded' } }),
        cancel: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Bridge not loaded' } }),
        openVideo: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'openVideo not implemented yet' } }),
        checkConnection: async () => ({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Bridge not loaded' } }),
      };
    }
  }
}

// Initialize desktop bridge immediately (non-blocking but sets up Promise)
const desktopBridgePromise = initDesktopBridge();

async function init(){
  // Wait for desktop bridge to be ready before proceeding
  await desktopBridgePromise;

  try{E.store=EstudiaStore.createStore(localStorage);E.settings=await window.desktop.getSettings();const sel=document.getElementById('sel-curso');sel.replaceChildren(...E.data.courses.map(c=>new Option(c,c)));sel.value=E.course();sel.onchange=()=>{try{E.store.setCourse(sel.value);E.request.cancelAll();E.voice.stop();E.lastTutorQuery=null;for(const feature of Object.values(E.features))feature.leave?.();E.router.go(E.router.current);}catch(e){sel.value=E.course();E.ui.toast(e.message,'error');}};E.router.init();E.voice.init();E.features.ajustes.init();document.getElementById('card-prueba').onclick=()=>E.router.go('practicas');document.getElementById('card-estudiar').onclick=()=>E.router.go('aprender');for(const [name,feature]of Object.entries(E.features))if(name!=='ajustes')feature.init?.();E.router.go('inicio');if(E.store.warning)E.ui.toast(E.store.warning,'error');E.ready=true;}catch{document.getElementById('app-message').textContent='No se pudo iniciar la interfaz. Cierra y vuelve a abrir la aplicación.';}}
if(document.readyState==='complete')init();else document.addEventListener('DOMContentLoaded',init,{once:true});
})();

# EstudiaIA PWA Web Version Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Electron-based EstudiaIA app into a Progressive Web App (PWA) that runs on any Chromebook without Linux (Crostini), using HTTPS hosting, Service Worker for offline support, and Web APIs for storage and TTS.

**Architecture:** The existing vanilla JS UI modules (src/ui/) are already framework-free and will be reused with minimal changes. Electron-specific services (main.cjs, preload.cjs, services/*) will be replaced with web-compatible equivalents: a static file server for development, Web Crypto API + IndexedDB for encrypted settings, Web Speech API for TTS (with edge-tts as optional cloud fallback), and a Vite-based build pipeline producing static assets + manifest.json + Service Worker. The app will be a single-page application served over HTTPS.

**Tech Stack:** Vite 5 (build/dev server), TypeScript (for new service modules), Workbox (Service Worker generation), Web Crypto API (AES-GCM for settings encryption), IndexedDB (via idb library), Web Speech API (primary TTS), optional edge-tts cloud fallback via serverless function.

**Spec:** This plan implements the "Versión web PWA" option from the Chromebook options discussion. No separate spec document exists; this plan is the spec.

## Global Constraints

- Must run on ChromeOS without Crostini (pure web, no Node.js at runtime)
- HTTPS required for PWA features (Service Worker, Web Speech API, installability)
- Settings encryption must use Web Crypto API (AES-GCM), key derived from user password via PBKDF2
- Voice: primary = Web Speech API (Spanish Mexico voice "Dalia" equivalent); fallback = edge-tts via HTTPS endpoint (to be implemented separately)
- All existing UI modules (18 files) must work without modification where possible
- Offline-first: app shell caches on first visit; data (settings, progress) syncs when online
- No Electron APIs in production bundle (ipcRenderer, safeStorage, protocol, etc.)
- Build output: static files in `dist-pwa/` ready for any static host (Netlify, Vercel, Firebase, GitHub Pages, custom server)

## Review Focus

1. **Offline data loss** — User edits settings or progress offline, then closes browser before sync. Expected: local IndexedDB persists; next online visit syncs automatically.
2. **Web Speech API voice unavailable** — ChromeOS may lack Spanish Mexico voice. Expected: graceful fallback to any Spanish voice, UI shows "Voz limitada" badge, edge-tts cloud button offered.
3. **HTTPS not available in development** — `vite dev` serves HTTP. Expected: `vite dev --https` with self-signed cert for local PWA testing; documented workaround for ChromeOS device testing (ngrok/localtunnel).
4. **Settings migration from Electron** — Existing users have encrypted settings in safeStorage format. Expected: on first PWA load, detect Electron data (if any via file:// access), offer one-time import; otherwise fresh setup.
5. **Large audio blob handling** — edge-tts returns ~1-5 MB MP3 per chunk. Expected: streaming playback via MediaSource or AudioContext; cache in IndexedDB with LRU eviction (max 50 MB).

---

### Task 1: Project Setup & Build Configuration

**Files:**
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `package.json` (extend existing with PWA scripts/deps)
- Create: `public/manifest.json`
- Create: `public/sw.js` (Workbox injectManifest entry)
- Modify: `src/ui/index.html` → `index.html` (move to root, update script paths)
- Test: `tests/pwa/build.test.ts`

**Interfaces:**
- Consumes: existing src/ui/*, src/shared/*, src/services/* (to be refactored)
- Produces: Vite config with PWA plugin, manifest, SW entry, dev HTTPS cert script

- [ ] **Step 1: Write failing test for build output**

```typescript
// tests/pwa/build.test.ts
import { describe, it, expect } from 'vitest';
import { build } from 'vite';

describe('PWA build', () => {
  it('produces dist-pwa with index.html, manifest.json, sw.js, and all UI modules', async () => {
    const result = await build({ configFile: 'vite.config.ts', mode: 'production' });
    // Check output files exist
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pwa/build.test.ts`
Expected: FAIL — vite.config.ts doesn't exist

- [ ] **Step 3: Create `vite.config.ts` with PWA configuration**

- Vite 5 + @vitejs/plugin-pwa (Workbox)
- Input: `src/ui/index.html` (moved to root as `index.html`)
- Output: `dist-pwa/`
- Manifest: name "EstudiaIA 2", short_name "EstudiaIA", start_url "/", display "standalone", background_color "#f1f5f9", theme_color "#3b82f6", icons from build/icon-*.png
- Workbox: injectManifest with `public/sw.js` entry, precache all static assets, runtime caching for YouTube thumbnails (i.ytimg.com) and Gemini API (generativelanguage.googleapis.com)
- Dev server: HTTPS with self-signed cert (generate via script), port 5173
- Aliases: `@shared` → `src/shared`, `@services` → `src/services`, `@ui` → `src/ui`

- [ ] **Step 4: Create `tsconfig.json`**

- Target ES2022, module ESNext, moduleResolution bundler
- Strict true, allowJs true (for existing .cjs files during transition)
- Paths matching Vite aliases

- [ ] **Step 5: Update `package.json` with PWA scripts and deps**

- Add devDependencies: vite, @vitejs/plugin-pwa, workbox-window, idb, vitest, @types/node
- Scripts: `dev:pwa`, `build:pwa`, `preview:pwa`, `test:pwa`
- Keep existing Electron scripts intact

- [ ] **Step 6: Create `public/manifest.json`**

- Icons: generate from build/icon.svg (512x512) → 72, 96, 128, 144, 152, 192, 384, 512
- Shortcuts: "Nueva práctica", "Mis materias", "Progreso"
- Categories: ["education", "productivity"]

- [ ] **Step 7: Create `public/sw.js` (Workbox injectManifest entry)**

- precacheManifest from Workbox
- Runtime caching: StaleWhileRevalidate for YouTube thumbnails, NetworkFirst for API calls
- NavigationPreload enabled
- SkipWaiting + ClientsClaim

- [ ] **Step 8: Move `src/ui/index.html` to root `index.html` and update script paths**

- Remove `../shared/` and `../` prefixes → use Vite aliases
- Add `<link rel="manifest" href="/manifest.json">`
- Add `<meta name="theme-color" content="#3b82f6">`
- Add PWA meta tags (apple-mobile-web-app-*)

- [ ] **Step 9: Run build test to verify it passes**

Run: `npx vitest run tests/pwa/build.test.ts`
Expected: PASS — dist-pwa/ contains all required files

- [ ] **Step 10: Commit**

```bash
git add vite.config.ts tsconfig.json package.json public/manifest.json public/sw.js index.html tests/pwa/build.test.ts
git commit -m "feat(pwa): add Vite PWA build configuration"
```

---

### Task 2: Web-Compatible Settings Service (Encrypted IndexedDB)

**Files:**
- Create: `src/services/settings-web.ts`
- Create: `tests/unit/settings-web.test.ts`
- Modify: `src/shared/store.js` → remove Electron safeStorage references (or create web shim)
- Test: `tests/unit/settings-web.test.ts`

**Interfaces:**
- Consumes: none (new standalone service)
- Produces: `createSettingsStoreWeb({dbName?, storeName?})` → `{ get(key), set(key, value), remove(key), clear(), isEncryptionAvailable(), migrateFromElectron(electronData) }`

- [ ] **Step 1: Write failing test for settings encryption/decryption**

```typescript
// tests/unit/settings-web.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createSettingsStoreWeb } from '@services/settings-web';

describe('settings-web', () => {
  let store: ReturnType<typeof createSettingsStoreWeb>;
  beforeEach(() => { store = createSettingsStoreWeb({ dbName: 'test-settings' }); });

  it('encrypts and decrypts settings with password-derived key', async () => {
    await store.set('geminiKey', 'test-key-123', 'user-password');
    const value = await store.get('geminiKey', 'user-password');
    expect(value).toBe('test-key-123');
  });

  it('returns null for wrong password', async () => {
    await store.set('key', 'value', 'pass1');
    const value = await store.get('key', 'pass2');
    expect(value).toBeNull();
  });

  it('isEncryptionAvailable returns true in secure context', async () => {
    expect(await store.isEncryptionAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/settings-web.test.ts`
Expected: FAIL — settings-web.ts doesn't exist

- [ ] **Step 3: Implement `createSettingsStoreWeb` in `src/services/settings-web.ts`**

- Use `idb` library for IndexedDB wrapper
- Key derivation: PBKDF2 (SHA-256, 100k iterations) from user password + stored salt
- Encryption: AES-GCM 256-bit, IV stored with ciphertext
- Storage schema: `{ key: string, value: { iv: Uint8Array, ciphertext: Uint8Array, salt: Uint8Array } }`
- `isEncryptionAvailable()`: checks `window.crypto.subtle` and `window.isSecureContext`
- `migrateFromElectron(electronData)`: attempts to decrypt with safeStorage format (not possible without Electron), so returns { success: false, reason: 'requires-electron' } — UI will show "Configuración nueva" instead

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/settings-web.test.ts`
Expected: PASS

- [ ] **Step 5: Create web shim for `src/shared/store.js` if needed**

- If existing store.js is used by UI modules, create `store-web.js` that re-exports settings-web API with same interface
- Or update UI modules to import from `@services/settings-web` directly

- [ ] **Step 6: Commit**

```bash
git add src/services/settings-web.ts tests/unit/settings-web.test.ts src/shared/store-web.js
git commit -m "feat(pwa): add encrypted IndexedDB settings service"
```

---

### Task 3: Web-Compatible Voice Service (Web Speech API + edge-tts Fallback)

**Files:**
- Create: `src/services/voice-web.ts`
- Create: `tests/unit/voice-web.test.ts`
- Modify: `src/ui/voice-player.js` → adapt to use voice-web service
- Test: `tests/unit/voice-web.test.ts`

**Interfaces:**
- Consumes: none (new standalone service)
- Produces: `createVoiceServiceWeb({cacheDir?})` → `{ speak(text, options?), stop(), pause(), resume(), getVoices(), onVoiceChange(callback), isCloudAvailable() }`

- [ ] **Step 1: Write failing test for voice service**

```typescript
// tests/unit/voice-web.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createVoiceServiceWeb } from '@services/voice-web';

describe('voice-web', () => {
  let voice: ReturnType<typeof createVoiceServiceWeb>;
  beforeEach(() => { voice = createVoiceServiceWeb(); });

  it('getVoices returns SpeechSynthesisVoice list', async () => {
    const voices = await voice.getVoices();
    expect(Array.isArray(voices)).toBe(true);
  });

  it('speak queues utterance and returns promise', async () => {
    const p = voice.speak('Hola mundo', { lang: 'es-MX' });
    expect(p).toBeInstanceOf(Promise);
    await p; // resolves when utterance ends
  });

  it('stop cancels current utterance', async () => {
    voice.speak('Largo texto...'.repeat(100));
    voice.stop();
    // No error thrown
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/voice-web.test.ts`
Expected: FAIL — voice-web.ts doesn't exist

- [ ] **Step 3: Implement `createVoiceServiceWeb` in `src/services/voice-web.ts`**

- Primary: `window.speechSynthesis` — filter voices for `lang.startsWith('es')`, prefer `es-MX` or `es-419` (Dalia equivalent)
- Chunking: split text at sentence boundaries, max 480 chars per utterance (matching Electron MAX_CHUNK_CHARS)
- Sequential playback: queue utterances, `onend` → next chunk
- Controls: stop/pause/resume via `speechSynthesis` API
- `isCloudAvailable()`: returns false initially; later Task 7 adds edge-tts endpoint check
- Cache: optional IndexedDB for cloud TTS audio blobs (LRU, 50 MB max)

- [ ] **Step 4: Adapt `src/ui/voice-player.js` to use voice-web service**

- Replace Electron IPC calls (`voice:play`, `voice:stop`, etc.) with direct service calls
- Keep same UI interface (buttons, select, status)
- Populate voice select from `getVoices()` on load and `voiceschanged` event
- Show "Voz del navegador" badge; if no Spanish voice, show "Voz limitada" and enable cloud fallback button (hidden until Task 7)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/voice-web.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/voice-web.ts tests/unit/voice-web.test.ts src/ui/voice-player.js
git commit -m "feat(pwa): add Web Speech API voice service with chunking"
```

---

### Task 4: Providers Service (Gemini + YouTube API) — Web Fetch

**Files:**
- Create: `src/services/providers-web.ts`
- Create: `tests/unit/providers-web.test.ts`
- Modify: `src/ui/tutor.js`, `src/ui/videos.js` → use providers-web instead of IPC
- Test: `tests/unit/providers-web.test.ts`

**Interfaces:**
- Consumes: settings-web (for API keys)
- Produces: `createProviderServiceWeb({settingsStore})` → `{ askGemini(prompt, model?), searchYouTube(query, maxResults?), close() }`

- [ ] **Step 1: Write failing test for providers**

```typescript
// tests/unit/providers-web.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createProviderServiceWeb } from '@services/providers-web';
import { createSettingsStoreWeb } from '@services/settings-web';

describe('providers-web', () => {
  let settings: ReturnType<typeof createSettingsStoreWeb>;
  let providers: ReturnType<typeof createProviderServiceWeb>;
  beforeEach(() => {
    settings = createSettingsStoreWeb({ dbName: 'test-providers' });
    providers = createProviderServiceWeb({ settingsStore: settings });
  });

  it('askGemini throws if no API key configured', async () => {
    await expect(providers.askGemini('test')).rejects.toThrow('GEMINI_KEY_MISSING');
  });

  it('searchYouTube throws if no API key configured', async () => {
    await expect(providers.searchYouTube('test')).rejects.toThrow('YOUTUBE_KEY_MISSING');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/providers-web.test.ts`
Expected: FAIL — providers-web.ts doesn't exist

- [ ] **Step 3: Implement `createProviderServiceWeb` in `src/services/providers-web.ts`**

- `askGemini(prompt, model?)`: POST to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}` with JSON body
- `searchYouTube(query, maxResults=10)`: GET `https://www.googleapis.com/youtube/v3/search` with key, part=snippet, type=video, maxResults
- Both: fetch with AbortController (30s timeout), error handling for 401/403/429
- Keys retrieved from settings-store via `get('geminiKey')` / `get('youtubeKey')` (requires password — UI handles prompting)
- `close()`: no-op for web (kept for interface compatibility)

- [ ] **Step 4: Update `src/ui/tutor.js` and `src/ui/videos.js` to use providers-web**

- Replace `window.electronAPI.providers.askGemini` → `providers.askGemini()`
- Replace `window.electronAPI.providers.searchYouTube` → `providers.searchYouTube()`
- Handle promise-based API (was IPC async)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/providers-web.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/providers-web.ts tests/unit/providers-web.test.ts src/ui/tutor.js src/ui/videos.js
git commit -m "feat(pwa): add web fetch providers for Gemini and YouTube"
```

---

### Task 5: Security/Protocol Replacement — Static Asset Serving

**Files:**
- Create: `src/services/security-web.ts`
- Modify: `src/ui/bootstrap.js` → remove `estudiaia://` protocol references
- Test: `tests/unit/security-web.test.ts`

**Interfaces:**
- Consumes: none
- Produces: `APP_URL` (string, e.g. '/' in production, '/src/ui/' in dev), `resolveAssetPath(url, baseDir)` → file path

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/security-web.test.ts
import { describe, it, expect } from 'vitest';
import { APP_URL, resolveAssetPath } from '@services/security-web';

describe('security-web', () => {
  it('APP_URL is root in production', () => {
    expect(APP_URL).toBe('/');
  });

  it('resolveAssetPath maps relative URLs to public paths', () => {
    expect(resolveAssetPath('/styles.css', '/app')).toBe('/styles.css');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/security-web.test.ts`
Expected: FAIL — security-web.ts doesn't exist

- [ ] **Step 3: Implement `security-web.ts`**

- `APP_URL = import.meta.env.PROD ? '/' : '/src/ui/'` (Vite serves src/ in dev)
- `resolveAssetPath(url, baseDir)`: strips leading `/`, resolves against `public/` or `src/ui/`
- No CSP header injection (handled by hosting platform)
- Remove `protocol.handle('estudiaia', ...)` — not needed for static hosting

- [ ] **Step 4: Update `src/ui/bootstrap.js`**

- Remove any `estudiaia://` references
- Initialize app directly on DOMContentLoaded (no protocol handler needed)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/security-web.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/security-web.ts tests/unit/security-web.test.ts src/ui/bootstrap.js
git commit -m "feat(pwa): replace Electron protocol with static asset serving"
```

---

### Task 6: IPC Removal & Direct Service Wiring

**Files:**
- Delete: `src/services/ipc.cjs` (Electron-only)
- Create: `src/services/app-context.ts` (singleton wiring services together)
- Modify: `src/ui/bootstrap.js` → import and initialize app-context
- Modify: all UI modules (`tutor.js`, `materias.js`, `practicas.js`, `videos.js`, `progreso.js`, `estudiar.js`, `leccion.js`, `settings.js`) → import services from app-context instead of `window.electronAPI`
- Test: `tests/unit/app-context.test.ts`

**Interfaces:**
- Consumes: settings-web, voice-web, providers-web
- Produces: `createAppContext()` → `{ settings, voice, providers, router, store }` initialized once

- [ ] **Step 1: Write failing test for app context**

```typescript
// tests/unit/app-context.test.ts
import { describe, it, expect } from 'vitest';
import { createAppContext } from '@services/app-context';

describe('app-context', () => {
  it('creates context with all services', () => {
    const ctx = createAppContext();
    expect(ctx.settings).toBeDefined();
    expect(ctx.voice).toBeDefined();
    expect(ctx.providers).toBeDefined();
    expect(ctx.router).toBeDefined();
    expect(ctx.store).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/app-context.test.ts`
Expected: FAIL — app-context.ts doesn't exist

- [ ] **Step 3: Implement `createAppContext` in `src/services/app-context.ts`**

- Lazy-initialize services on first access
- Export `getAppContext()` singleton getter
- Router: reuse existing `src/ui/router.js` (hash-based, works unchanged)
- Store: reuse `src/shared/store.js` or `store-web.js`

- [ ] **Step 4: Update all UI modules to import from app-context**

- Replace `const { ipcRenderer } = require('electron')` or `window.electronAPI` patterns with `import { getAppContext } from '@services/app-context'`
- Update `settings.js` to use settings-web with password prompt UI
- Update `tutor.js`, `videos.js` to use providers-web
- Update `voice-player.js` already done in Task 3

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/app-context.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/app-context.ts tests/unit/app-context.test.ts src/ui/bootstrap.js src/ui/*.js
git commit -m "feat(pwa): wire services directly, remove Electron IPC"
```

---

### Task 7: Edge-TTS Cloud Fallback (Optional Serverless Function)

**Files:**
- Create: `api/tts.js` (Vercel/Netlify function) or `supabase/functions/tts/` (Supabase Edge Function)
- Create: `src/services/voice-cloud.ts` (client-side cloud TTS caller)
- Modify: `src/services/voice-web.ts` → integrate cloud fallback
- Modify: `src/ui/voice-player.js` → show "Voz premium" button when cloud available
- Test: `tests/unit/voice-cloud.test.ts`

**Interfaces:**
- Consumes: voice-web (for cache), NIM_API_KEY or edge-tts credentials (env var)
- Produces: `speakCloud(text, voice?) → Promise<ArrayBuffer>` (MP3)

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/voice-cloud.test.ts
import { describe, it, expect, vi } from 'vitest';
import { speakCloud } from '@services/voice-cloud';

describe('voice-cloud', () => {
  it('returns ArrayBuffer for valid text', async () => {
    const audio = await speakCloud('Hola', 'es-MX-DaliaNeural');
    expect(audio).toBeInstanceOf(ArrayBuffer);
    expect(audio.byteLength).toBeGreaterThan(1000);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/voice-cloud.test.ts`
Expected: FAIL — voice-cloud.ts and API endpoint don't exist

- [ ] **Step 3: Create serverless TTS endpoint**

- Vercel: `api/tts.ts` — POST `{ text, voice }` → calls edge-tts (Python) or Microsoft TTS API, returns MP3
- Or Supabase Edge Function: `supabase/functions/tts/index.ts` — same
- Deploy separately; document in README

- [ ] **Step 4: Implement `voice-cloud.ts` client**

- `speakCloud(text, voice)`: fetch to deployed endpoint, return ArrayBuffer
- Cache in IndexedDB (key: hash(text+voice), value: blob) with LRU

- [ ] **Step 5: Integrate into `voice-web.ts`**

- `isCloudAvailable()`: checks if endpoint URL configured (env var `VITE_TTS_ENDPOINT`)
- `speak()`: if Web Speech voice not Spanish Mexico, offer cloud via UI callback

- [ ] **Step 6: Update `voice-player.js` UI**

- Add "Voz premium (cloud)" button when `isCloudAvailable()` and no `es-MX` voice
- On click: call cloud TTS, play via AudioContext

- [ ] **Step 7: Run test to verify it passes**

Run: `npx vitest run tests/unit/voice-cloud.test.ts`
Expected: PASS (requires deployed endpoint URL in test env)

- [ ] **Step 8: Commit**

```bash
git add api/tts.ts src/services/voice-cloud.ts src/services/voice-web.ts src/ui/voice-player.js tests/unit/voice-cloud.test.ts
git commit -m "feat(pwa): add edge-tts cloud fallback for premium voice"
```

---

### Task 8: Service Worker Registration & Offline UX

**Files:**
- Modify: `src/ui/bootstrap.js` → register SW, handle updates
- Create: `src/ui/offline-banner.js` (shows when offline)
- Create: `tests/unit/sw-registration.test.ts`
- Test: `tests/unit/sw-registration.test.ts`

**Interfaces:**
- Consumes: Workbox `workbox-window` module
- Produces: SW registration lifecycle hooks, offline/online banner

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/sw-registration.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('SW registration', () => {
  it('registers Service Worker on load', async () => {
    const { registerSW } = await import('@ui/bootstrap');
    // Mock navigator.serviceWorker.register
  });

  it('shows offline banner when navigator.onLine === false', () => {
    // Render offline-banner component
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/sw-registration.test.ts`
Expected: FAIL — registration code not in bootstrap.js

- [ ] **Step 3: Add SW registration to `bootstrap.js`**

- Import `Workbox` from `workbox-window`
- Register `/sw.js` on load
- Listen for `waiting` → show "Nueva versión disponible" toast with "Actualizar" button
- Listen for `controlling` → reload page
- Listen for `offline`/`online` → show/hide offline banner

- [ ] **Step 4: Create `offline-banner.js` component**

- Fixed bottom banner: "Sin conexión. Los cambios se guardarán localmente y se sincronizarán al volver."
- Auto-hide on online

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/unit/sw-registration.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/ui/bootstrap.js src/ui/offline-banner.js tests/unit/sw-registration.test.ts
git commit -m "feat(pwa): add Service Worker registration and offline UX"
```

---

### Task 9: PWA Install Prompt & Icons

**Files:**
- Create: `src/ui/install-prompt.js`
- Modify: `src/ui/index.html` (already has manifest link from Task 1)
- Create: `build/icon.svg` → generate PNG icons via script
- Test: `tests/unit/install-prompt.test.ts`

**Interfaces:**
- Consumes: `beforeinstallprompt` event
- Produces: Install button in header when PWA installable

- [ ] **Step 1: Write failing test**

```typescript
// tests/unit/install-prompt.test.ts
import { describe, it, expect, vi } from 'vitest';

describe('Install prompt', () => {
  it('shows install button after beforeinstallprompt fires', () => {
    // Mock event, render component, check button exists
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/install-prompt.test.ts`
Expected: FAIL — install-prompt.js doesn't exist

- [ ] **Step 3: Create `build/icon.svg` and icon generation script**

- SVG: simple "EI" logo on #3b82f6 background
- Script: `scripts/generate-icons.cjs` using sharp → outputs to `public/icons/`

- [ ] **Step 4: Implement `install-prompt.js`**

- Listen for `beforeinstallprompt`, store event
- Show "Instalar app" button in header (next to connection status)
- On click: `prompt()`, wait for `userChoice`, hide button if accepted

- [ ] **Step 5: Add install button to `index.html` header**

- `<button id="install-btn" class="btn secondary" hidden>Instalar app</button>`

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/unit/install-prompt.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/ui/install-prompt.js build/icon.svg scripts/generate-icons.cjs public/icons/ tests/unit/install-prompt.test.ts
git commit -m "feat(pwa): add install prompt and icon generation"
```

---

### Task 10: End-to-End PWA Test & Deployment Verification

**Files:**
- Create: `tests/pwa/e2e.test.ts` (Playwright)
- Create: `.github/workflows/pwa-deploy.yml` (CI for build + deploy preview)
- Test: `tests/pwa/e2e.test.ts`

**Interfaces:**
- Consumes: built `dist-pwa/`
- Produces: verified PWA checklist (Lighthouse PWA score ≥ 90)

- [ ] **Step 1: Write failing e2e test**

```typescript
// tests/pwa/e2e.test.ts
import { test, expect } from '@playwright/test';

test.describe('PWA e2e', () => {
  test('loads offline after first visit', async ({ page, context }) => {
    await page.goto('http://localhost:5173');
    await expect(page.locator('#main')).toBeVisible();
    // Go offline
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#main')).toBeVisible(); // served from SW cache
  });

  test('settings persist across reload', async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Set a setting, reload, verify persists
  });

  test('voice plays via Web Speech API', async ({ page }) => {
    await page.goto('http://localhost:5173');
    await page.click('#voice-play');
    // Check speechSynthesis.speak called
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/pwa/e2e.test.ts`
Expected: FAIL — PWA not built/served yet

- [ ] **Step 3: Build and serve PWA for testing**

Run: `npm run build:pwa && npx serve dist-pwa -p 5173 --ssl-cert ...`

- [ ] **Step 4: Run e2e tests**

Run: `npx playwright test tests/pwa/e2e.test.ts`
Expected: PASS (all 3 tests)

- [ ] **Step 5: Create GitHub Actions workflow for CI**

- Job: install deps, run unit tests, build:pwa, upload dist-pwa artifact
- Optional: deploy preview to Netlify/Vercel on PR

- [ ] **Step 6: Run Lighthouse PWA audit**

Run: `npx lighthouse http://localhost:5173 --only-categories=pwa --output=json`
Expected: PWA score ≥ 90

- [ ] **Step 7: Commit**

```bash
git add tests/pwa/e2e.test.ts .github/workflows/pwa-deploy.yml
git commit -m "feat(pwa): add e2e tests and CI workflow"
```

---

### Task 11: Documentation & Deployment Guide

**Files:**
- Create: `docs/PWA_DEPLOYMENT.md`
- Modify: `README.md` → add PWA section
- Test: none (documentation)

**Interfaces:**
- Consumes: all previous tasks
- Produces: deployment guide for Netlify, Vercel, Firebase, GitHub Pages, custom nginx

- [ ] **Step 1: Write `docs/PWA_DEPLOYMENT.md`**

- Prerequisites: HTTPS domain, Node 22+ for build
- Build: `npm run build:pwa` → `dist-pwa/`
- Deploy targets:
  - Netlify: drag-drop `dist-pwa/` or connect repo, build command `npm run build:pwa`, publish `dist-pwa`
  - Vercel: `vercel deploy dist-pwa --prod`
  - Firebase: `firebase deploy --only hosting` (configure `public: dist-pwa`)
  - GitHub Pages: push `dist-pwa/` to `gh-pages` branch
  - Custom nginx: serve `dist-pwa/` with HTTPS, add `Service-Worker-Allowed: /` header
- HTTPS: required for PWA; Let's Encrypt via Certbot or Cloudflare
- Edge-TTS endpoint: deploy `api/tts.ts` separately, set `VITE_TTS_ENDPOINT` env var
- ChromeOS testing: `vite dev --https` + ngrok for device access

- [ ] **Step 2: Update `README.md` with PWA quickstart**

- Add "Versión Web (PWA)" section with build/deploy commands

- [ ] **Step 3: Commit**

```bash
git add docs/PWA_DEPLOYMENT.md README.md
git commit -m "docs(pwa): add deployment guide and README update"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-10-20-pwa-web-version.md`. Please review the plan. Which execution approach would you prefer?**

- **Subagent-driven** - A fresh subagent implements each task and a fresh reviewer checks it before the next one starts, then a whole-branch review at the end. Most thorough; costs a fresh context per task and per review.
- **Native** - I implement every task myself in this session, the way this harness runs work, then one fresh reviewer on the most capable model checks the whole branch. Cheapest and fastest; no independent review until the end. Runs well with a mid-tier session model, since the plan carries the design.

**For this plan I recommend Native**, because the tasks are highly sequential (each builds on the previous service layer), there are 11 tasks with clear dependencies, and a shipped mistake would only affect the PWA build (Electron app remains untouched). Does the plan capture what you want, and which approach should we use?
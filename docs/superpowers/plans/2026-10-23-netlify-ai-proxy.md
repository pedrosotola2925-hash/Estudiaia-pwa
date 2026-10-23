# Netlify AI Proxy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que la PWA de EstudiaIA use funciones privadas de Netlify para Gemini y YouTube, sin claves ni desbloqueo local en Chromebooks.

**Architecture:** Dos Netlify Functions reciben solicitudes JSON validadas desde la PWA, usan las variables de entorno del servidor y devuelven respuestas con códigos seguros. El cliente PWA conserva cancelación, límites y mensajes de error, pero deja de leer secretos locales; Ajustes conserva solo voz y velocidad. Electron y su flujo de claves local no se modifican.

**Tech Stack:** Node 22, Netlify Functions (`.mjs`, `Request`/`Response`), Vite PWA, Workbox, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-23-netlify-ai-proxy-design.md`

## Global Constraints

- El modelo del servidor es exactamente `gemini-3.5-flash-lite`; ningún campo enviado por el navegador puede cambiarlo.
- Las únicas variables de entorno requeridas en Netlify son `GEMINI_API_KEY` y `YOUTUBE_API_KEY`; sus valores no entran en Git, `netlify.toml`, `dist-pwa/`, IndexedDB, logs de aplicación ni respuestas HTTP.
- Las funciones aceptan solamente `POST` con `Content-Type: application/json`, validan estructura/tamaño/tipos y responden `Cache-Control: no-store`.
- Las funciones devuelven únicamente mensajes seguros y los códigos `SERVICE_NOT_CONFIGURED`, `INVALID_FORMAT`, `QUOTA`, `PROVIDER_ERROR` o `TIMEOUT` cuando corresponda; nunca devuelven errores crudos de Google.
- La PWA no puede contener `generativelanguage.googleapis.com`, `www.googleapis.com` ni URLs `key=` en el bundle publicado.
- El Service Worker trata `/.netlify/functions/*` como `NetworkOnly` y no guarda respuestas de IA o vídeo.
- La PWA no lee, descifra, borra ni migra las claves cifradas existentes en IndexedDB; simplemente deja de referenciarlas.
- Voz y velocidad siguen siendo preferencias locales. El modelo, las claves, desbloqueo, comprobación y borrado de claves desaparecen solo de la PWA.
- No modificar los servicios o UI de Electron: `src/services/ipc.cjs`, `src/services/providers.cjs`, `src/services/security.cjs`, `src/ui/settings.js` y `src/preload.cjs` quedan fuera de alcance.
- No implementar autenticación, cobro ni rate limiting persistente en esta fase.

## Review Focus

1. Una solicitud malformada, demasiado grande o con un archivo falso debe ser rechazada antes de llamar a Google. Se prueba en la Tarea 1.
2. La ausencia de cada secreto en Netlify debe generar `SERVICE_NOT_CONFIGURED` sin pedir una clave al estudiante ni revelar detalles internos. Se prueba en las Tareas 1 y 2.
3. Un campo `model` enviado por una persona maliciosa no puede cambiar `gemini-3.5-flash-lite`. Se prueba en la Tarea 1.
4. Cancelación, timeout y errores seguros deben seguir permitiendo que Tutor, Prácticas y Vídeos muestren mensajes sin bloquear la interfaz. Se prueba en la Tarea 3.
5. Un despliegue PWA no puede contener endpoints directos de Google, secretos locales o caché de funciones; Inicio debe funcionar con una función simulada sin desbloquear Ajustes. Se prueba en la Tarea 5.

---

### Task 1: Configuración reproducible y función Gemini segura

**Files:**
- Create: `netlify.toml`
- Create: `netlify/functions/gemini.mjs`
- Create: `tests/unit/netlify-gemini.test.ts`
- Modify: `package.json` (solo si hace falta un script explícito para ejecutar las pruebas de funciones)

**Interfaces:**
- Consumes: `POST /.netlify/functions/gemini` con JSON `{ "request": GeneratedRequest }`, donde `GeneratedRequest` usa los campos validados hoy por `src/services/security.cjs::validateAIRequest`.
- Produces: una función Netlify por defecto `async function handler(request: Request): Promise<Response>` que devuelve `{ "text": string }` o `{ "error": { "code": string, "message": string } }`.
- Produces: `netlify.toml` con `[build] command = "npm run build:pwa"`, `publish = "dist-pwa"`, y `[functions] directory = "netlify/functions"`.

- [ ] **Step 1: Escribir pruebas que fallen para el contrato de Gemini**

En `tests/unit/netlify-gemini.test.ts`, importar el `default` de `netlify/functions/gemini.mjs` y crear solicitudes `Request` reales. Cubrir como mínimo:

```ts
it('rechaza GET, Content-Type no JSON y cuerpos inválidos sin llamar al proveedor', async () => {
  await expect(readError(await handler(new Request('https://site/.netlify/functions/gemini'))))
    .resolves.toMatchObject({ code: 'INVALID_FORMAT' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('fija gemini-3.5-flash-lite aunque el cliente intente enviar otro modelo', async () => {
  const response = await handler(jsonRequest({ request: {
    id: 'tutor-1', kind: 'tutor', course: '7º básico',
    question: '¿Qué es una fracción?', model: 'modelo-no-autorizado',
  }}));
  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.5-flash-lite:generateContent');
  expect(fetchMock.mock.calls[0][0]).not.toContain('modelo-no-autorizado');
});
```

Añadir casos para falta de `GEMINI_API_KEY`, error 429, error de proveedor, abort a los 30 segundos, fichero `notes` sobre el máximo o con firma/MIME inválidos, y cabecera `Cache-Control: no-store` en éxito y error.

- [ ] **Step 2: Ejecutar las pruebas nuevas para confirmar que fallan**

Run: `npx vitest run tests/unit/netlify-gemini.test.ts`

Expected: FAIL porque aún no existen `netlify/functions/gemini.mjs` ni el handler.

- [ ] **Step 3: Crear `netlify.toml` y la función `gemini.mjs`**

Implementar la función con exportación por defecto compatible con Netlify:

```js
export default async function handler(request) { /* Response */ }
```

- Aceptar únicamente `POST` y JSON; medir el cuerpo leído antes de parsearlo y rechazar sobre 6 MiB.
- Cargar `validateAIRequest` y `buildPrompt` desde los módulos CommonJS existentes mediante `createRequire`, para conservar las reglas educativas, de curso, archivos y formatos ya usadas por Electron.
- Invocar `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent` con `x-goog-api-key: process.env.GEMINI_API_KEY`; no interpolar la clave en una URL ni imprimirla.
- Construir `systemInstruction`, `contents` y `generationConfig` con la salida de `buildPrompt`; usar `maxOutputTokens: 4096` y `responseMimeType: 'application/json'` solo cuando el prompt lo requiera.
- Aplicar `AbortController` de 30 segundos al `fetch` saliente, validar que la respuesta contiene texto no vacío y traducir errores a la envoltura segura especificada.
- Si no existe `GEMINI_API_KEY`, responder `SERVICE_NOT_CONFIGURED` sin llamar a `fetch`.
- Todas las respuestas JSON deben incluir `Content-Type: application/json; charset=utf-8` y `Cache-Control: no-store`.

- [ ] **Step 4: Ejecutar pruebas de Gemini para confirmar que pasan**

Run: `npx vitest run tests/unit/netlify-gemini.test.ts`

Expected: PASS con todas las validaciones, modelo fijo, timeout y errores seguros cubiertos.

- [ ] **Step 5: Ejecutar una verificación estática de secretos y configuración**

Run: `git diff --check && git grep -nE 'GEMINI_API_KEY\s*=|AIza[0-9A-Za-z_-]{20,}' -- netlify.toml netlify/functions tests/unit/netlify-gemini.test.ts || true`

Expected: `git diff --check` no muestra errores y la búsqueda no encuentra valores reales de claves.

- [ ] **Step 6: Commit**

```bash
git add netlify.toml netlify/functions/gemini.mjs tests/unit/netlify-gemini.test.ts package.json
git commit -m "feat(pwa): add secure Gemini Netlify function"
```

### Task 2: Función YouTube segura y normalizada

**Files:**
- Create: `netlify/functions/youtube.mjs`
- Create: `tests/unit/netlify-youtube.test.ts`

**Interfaces:**
- Consumes: `POST /.netlify/functions/youtube` con `{ query: string, maxResults?: number }`.
- Produces: `{ videos: Array<{ id: string, title: string, thumbnail: string }> }` o la envoltura de error segura de la Tarea 1.
- Consumes: las mismas convenciones de error y cabeceras de `netlify/functions/gemini.mjs`.

- [ ] **Step 1: Escribir pruebas que fallen para YouTube**

En `tests/unit/netlify-youtube.test.ts`, cubrir:

```ts
it('no llama a YouTube si falta YOUTUBE_API_KEY', async () => {
  delete process.env.YOUTUBE_API_KEY;
  const response = await handler(jsonRequest({ query: 'fracciones 7º básico', maxResults: 4 }));
  expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_NOT_CONFIGURED' } });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('normaliza solo vídeos embebibles con identificador válido', async () => {
  // La respuesta upstream incluye un videoId de 11 caracteres y una fila inválida.
  expect(await response.json()).toEqual({ videos: [{
    id: 'abcdefghijk', title: 'Fracciones para séptimo',
    thumbnail: 'https://i.ytimg.com/vi/abcdefghijk/mqdefault.jpg',
  }] });
});
```

Incluir método no `POST`, JSON inválido, texto vacío, máximo fuera de 1–10, error 429, error del proveedor y `Cache-Control: no-store`.

- [ ] **Step 2: Ejecutar la prueba para confirmar que falla**

Run: `npx vitest run tests/unit/netlify-youtube.test.ts`

Expected: FAIL porque la función aún no existe.

- [ ] **Step 3: Implementar `netlify/functions/youtube.mjs`**

Implementar un handler por defecto que:

- Acepte solo el contrato de la tarea y limite `maxResults` a un entero entre 1 y 10.
- Rechace `query` vacío, con NUL o más de 1.000 caracteres antes de hacer red.
- Si falta `YOUTUBE_API_KEY`, devuelva `SERVICE_NOT_CONFIGURED` sin llamar al proveedor.
- Llame a YouTube Data API v3 desde el servidor con `part=snippet`, `type=video`, `safeSearch=strict`, `videoEmbeddable=true`, el límite validado y la clave solo en la solicitud saliente del servidor.
- Devuelva únicamente vídeos con `videoId` de 11 caracteres y título no vacío; construir la miniatura como `https://i.ytimg.com/vi/<id>/mqdefault.jpg` para no confiar en URLs arbitrarias del proveedor.
- Conserve la misma envoltura de errores seguros y cabeceras no-cacheables de Gemini. Nunca incluir la URL upstream ni la clave en el cuerpo de error.

- [ ] **Step 4: Ejecutar pruebas de YouTube para confirmar que pasan**

Run: `npx vitest run tests/unit/netlify-youtube.test.ts`

Expected: PASS con validación, ausencia de secreto, filtrado de resultados y errores seguros.

- [ ] **Step 5: Commit**

```bash
git add netlify/functions/youtube.mjs tests/unit/netlify-youtube.test.ts
git commit -m "feat(pwa): add secure YouTube Netlify function"
```

### Task 3: Cliente PWA de proveedores sin claves locales

**Files:**
- Modify: `src/services/providers-web.ts`
- Modify: `src/services/app-context.ts`
- Modify: `src/services/desktop-bridge.ts`
- Modify: `src/ui/estudiar.js`
- Modify: `tests/unit/providers-web.test.ts`
- Modify: `tests/unit/app-context.test.ts`
- Modify: `tests/ui/study.spec.cjs`

**Interfaces:**
- Consumes: `POST /.netlify/functions/gemini` de la Tarea 1 y `POST /.netlify/functions/youtube` de la Tarea 2.
- Produces: `createProviderServiceWeb()` sin argumentos secretos, con `generate(request)`, `searchVideos({ id, query })`, `cancel(id)` y `close()`.
- Produces: `AppContext.settings` usado solo para preferencias no secretas; `AppContext.providers` no recibe `settingsStore` ni `modelResolver`.
- Produces: solicitudes `plan` con `examDate: string`, compatible tanto con el nuevo servidor como con la validación Electron existente.

- [ ] **Step 1: Reemplazar las pruebas locales de claves por pruebas de proxy que fallen**

Reescribir `tests/unit/providers-web.test.ts` para que el mock de `fetch` vea solamente rutas same-origin:

```ts
it('envía generate únicamente a la función Gemini sin clave ni modelo del cliente', async () => {
  await providers.generate({
    id: 'practice-1', kind: 'practice', course: '7º básico',
    subjectId: 'matematica', unit: 'Álgebra',
  });
  expect(fetchMock.mock.calls[0][0]).toBe('/.netlify/functions/gemini');
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({ request: expect.objectContaining({ kind: 'practice' }) });
});

it('mantiene cancelación y convierte el error seguro de la función en ProviderError', async () => {
  // AbortSignal cancela una petición activa y { error: { code: 'QUOTA', ... } } llega a la UI con code QUOTA.
});
```

Añadir aserciones de que no se usa `settingsStore`, no se solicita `geminiKey`/`youtubeKey`, el timeout sigue siendo 30 s, `searchVideos()` usa `/.netlify/functions/youtube` y el resultado de `{ videos }` se normaliza al array esperado.

En `tests/ui/study.spec.cjs`, reemplazar la aserción de `last.context.today` por `last.examDate === today`.

- [ ] **Step 2: Ejecutar pruebas para confirmar que fallan contra las llamadas directas actuales**

Run: `npx vitest run tests/unit/providers-web.test.ts tests/unit/app-context.test.ts && npx playwright test tests/ui/study.spec.cjs --project=dev`

Expected: FAIL porque el proveedor actual lee IndexedDB, llama a Google directamente y el plan manda un objeto `context`.

- [ ] **Step 3: Implementar el cliente proxificado y eliminar dependencias de claves**

En `src/services/providers-web.ts`:

- Eliminar `GEMINI_BASE`, `YOUTUBE_BASE`, `ProviderSettingsStore`, `requireKey`, `promptFor`, `modelResolver`, `askGemini`, `searchYouTube` y `checkConnection`.
- Mantener `ProviderError`, `fetchJson`, el límite de seis operaciones activas, `cancel()` y `close()`.
- Hacer que `generate()` mande `{ request }` a `/.netlify/functions/gemini` y espere `{ text }`.
- Hacer que `searchVideos()` mande `{ query, maxResults: 4 }` a `/.netlify/functions/youtube` y espere `{ videos }`.
- Parsear la envoltura de error seguro de las funciones, preservar los códigos para la UI y nunca usar el texto crudo del proveedor.

En `src/services/app-context.ts`, construir `createProviderServiceWeb()` sin adaptador de secretos ni selector de modelo. En `src/services/desktop-bridge.ts`, hacer que el bridge web reenvíe la solicitud completa a `providers.generate()` y `providers.searchVideos()`; no debe consultar `settingsBridge.getSecret()` ni verificar bloqueo.

En `src/ui/estudiar.js`, mandar `examDate: selected` para `kind: 'plan'`, y no mandar el objeto `context` ni `today`. Esta forma ya es aceptada por `src/services/security.cjs`, por lo que Electron conserva compatibilidad.

- [ ] **Step 4: Ejecutar pruebas de cliente, contexto y plan**

Run: `npx vitest run tests/unit/providers-web.test.ts tests/unit/app-context.test.ts && npx playwright test tests/ui/study.spec.cjs --project=dev`

Expected: PASS; el cliente usa solo `/.netlify/functions/*`, mantiene cancelación/error y Electron sigue recibiendo `examDate` válido.

- [ ] **Step 5: Commit**

```bash
git add src/services/providers-web.ts src/services/app-context.ts src/services/desktop-bridge.ts src/ui/estudiar.js tests/unit/providers-web.test.ts tests/unit/app-context.test.ts tests/ui/study.spec.cjs
git commit -m "feat(pwa): route provider requests through Netlify"
```

### Task 4: Ajustes PWA sin desbloqueo ni claves de proveedor

**Files:**
- Modify: `src/services/settings-web-store.ts`
- Modify: `src/services/settings-bridge.ts`
- Modify: `src/services/app-context.ts` (solo si requiere adaptar el tipo de `SettingsService`)
- Modify: `src/ui/pwa-entry.ts`
- Modify: `src/ui/settings-pwa.js`
- Modify: `index.html`
- Modify: `tests/unit/settings-web.test.ts`
- Modify: `tests/pwa/e2e.test.ts`

**Interfaces:**
- Consumes: el almacenamiento IndexedDB de preferencias sin secreto existente.
- Produces: `SettingsSummary` con `{ voice: string, rate: number }` y `saveSettings({ voice?, rate? })`.
- Produces: la vista PWA de Ajustes sin campos/acciones de claves o contraseña, con estado de servicio gestionado y controles de voz/velocidad.
- Does not consume: `geminiKey`, `youtubeKey`, `model`, `unlock`, `lock`, `getSecret`, `clearKey`, `setMasterPassword` o datos cifrados legacy.

- [ ] **Step 1: Escribir pruebas que fallen para una PWA sin secretos locales**

En la sección wrapper/bridge de `tests/unit/settings-web.test.ts`, sustituir las expectativas de cifrado del wrapper por:

```ts
it('guarda voz y velocidad sin abrir ni leer el almacén de secretos', async () => {
  const settings = createSettingsStoreWebWrapper({ dbName: nextDatabaseName('preferences-only') });
  await expect(settings.save({ voice: 'es-CL-CatalinaNeural', rate: 10 }))
    .resolves.toEqual({ voice: 'es-CL-CatalinaNeural', rate: 10 });
});
```

Conservar las pruebas de bajo nivel de `settings-web.ts` como regresión criptográfica, pero hacer que la PWA no lo importe ni lo llame.

En `tests/pwa/e2e.test.ts`, reemplazar el test de desbloqueo/persistencia de claves por aserciones de que, tras cargar una PWA nueva:

```ts
await expect(page.locator('#settings-master-password')).toHaveCount(0);
await expect(page.locator('#settings-gemini-key')).toHaveCount(0);
await expect(page.locator('#settings-youtube-key')).toHaveCount(0);
```

Añadir una comprobación de persistencia únicamente de voz/velocidad.

- [ ] **Step 2: Ejecutar las pruebas para confirmar que fallan**

Run: `npx vitest run tests/unit/settings-web.test.ts && npx playwright test tests/pwa/e2e.test.ts`

Expected: FAIL porque el wrapper y la interfaz aún exponen bloqueo, modelo y claves.

- [ ] **Step 3: Implementar preferencias PWA y eliminar el flujo de claves**

En `src/services/settings-web-store.ts`, separar el wrapper PWA del almacén cifrado: persistir y devolver solo voz/velocidad; no crear, abrir, sondear, migrar, borrar ni descifrar la base `secrets` anterior. Se pueden leer valores de voz/velocidad de la base de preferencias existente, normalizando cualquier forma legacy sin reescribir ni tocar ciphertext.

En `src/services/settings-bridge.ts`, reducir el contrato a `getSettings()` y `saveSettings({ voice?, rate? })`. En el contexto PWA, eliminar todos los tipos y llamadas de secretos/modelo.

En `src/ui/pwa-entry.ts`, eliminar la importación de `@ui/settings.js` para que la UI de Electron no entre en el bundle PWA.

En `index.html` y `src/ui/settings-pwa.js`:

- Quitar `#settings-master-password`, `#settings-gemini-key`, `#settings-youtube-key`, `#settings-model`, botones de probar/borrar claves y controles de bloqueo.
- Conservar selector de voz, velocidad y su persistencia.
- Mostrar una explicación breve de que la IA y los vídeos los administra el sitio y requieren internet; no presentar acciones para introducir claves.
- Establecer un texto neutral en `#connection-status` como `IA del sitio`; los errores reales de función ya se propagan a Tutor/Vídeos.

- [ ] **Step 4: Ejecutar pruebas de ajustes y PWA**

Run: `npx vitest run tests/unit/settings-web.test.ts && npx playwright test tests/pwa/e2e.test.ts`

Expected: PASS; ninguna ruta PWA solicita contraseña ni clave y voz/velocidad se conservan tras recargar.

- [ ] **Step 5: Commit**

```bash
git add src/services/settings-web-store.ts src/services/settings-bridge.ts src/services/app-context.ts src/ui/pwa-entry.ts src/ui/settings-pwa.js index.html tests/unit/settings-web.test.ts tests/pwa/e2e.test.ts
git commit -m "feat(pwa): remove local provider unlock flow"
```

### Task 5: End-to-end PWA, Service Worker y auditoría del bundle

**Files:**
- Modify: `public/sw.js`
- Modify: `tests/pwa/build.test.ts`
- Modify: `tests/pwa/e2e.test.ts`
- Modify: `docs/superpowers/specs/2026-10-23-netlify-ai-proxy-design.md` (solo si una decisión de implementación obliga a aclarar el contrato; de lo contrario no modificar)

**Interfaces:**
- Consumes: las rutas de funciones de las Tareas 1–3 y el Service Worker actual de Vite/Workbox.
- Produces: funciones marcadas explícitamente como `NetworkOnly` para `POST /.netlify/functions/*` y pruebas que verifican la ausencia de rutas/secretos directos de Google en `dist-pwa/`.

- [ ] **Step 1: Añadir pruebas de seguridad del bundle y flujo sin desbloqueo que fallen**

En `tests/pwa/build.test.ts`, después de construir, concatenar `index.html` y los assets JavaScript/CSS de `dist-pwa/` y comprobar:

```ts
expect(bundle).not.toContain('generativelanguage.googleapis.com');
expect(bundle).not.toContain('www.googleapis.com/youtube/v3');
expect(bundle).not.toMatch(/[?&]key=/);
expect(bundle).not.toContain('settings-master-password');
expect(bundle).not.toContain('settings-gemini-key');
expect(bundle).not.toContain('settings-youtube-key');
```

Comprobar también que el `sw.js` construido contiene la regla `NetworkOnly` y el prefijo `/.netlify/functions/`.

En `tests/pwa/e2e.test.ts`, interceptar `**/.netlify/functions/gemini` con una respuesta `{ text: 'Respuesta simulada de EstudiaIA.' }`; abrir Inicio, preguntar sin ir a Ajustes y esperar el texto de respuesta. Interceptar YouTube de forma equivalente y confirmar que una búsqueda no pide claves.

- [ ] **Step 2: Ejecutar las pruebas para confirmar que fallan**

Run: `npm run test:pwa && npx playwright test tests/pwa/e2e.test.ts`

Expected: FAIL mientras haya llamadas directas, UI de claves o falta la regla NetworkOnly.

- [ ] **Step 3: Configurar el Service Worker y completar las pruebas de integración**

En `public/sw.js`, importar `NetworkOnly` y registrar una ruta para `/.netlify/functions/` con método `POST`, antes de la ruta de miniaturas. No crear cachés ni plugins de expiración para esas funciones. Mantener el precaché del shell y el caché de miniaturas `i.ytimg.com` sin cambios.

Ajustar los tests para tolerar la recarga que ocurre al tomar control el Service Worker y para responder a las rutas simuladas. No intentar ejecutar funciones reales con `scripts/serve-pwa.cjs`: ese servidor es estático y las pruebas deben interceptar los endpoints.

- [ ] **Step 4: Ejecutar la verificación completa del repositorio**

Run: `npm run test:unit && npx vitest run tests/unit/netlify-gemini.test.ts tests/unit/netlify-youtube.test.ts tests/unit/providers-web.test.ts tests/unit/settings-web.test.ts tests/unit/app-context.test.ts && npm run test:pwa && npx playwright test tests/pwa/e2e.test.ts && npm run build:pwa`

Expected: todos los comandos terminan en exit 0; la PWA generada no incluye endpoints directos, claves ni UI de desbloqueo, y las funciones se prueban con mocks sin secretos reales.

- [ ] **Step 5: Hacer auditoría final de artefactos y commit**

Run: `git diff --check && git grep -nE 'AIza[0-9A-Za-z_-]{20,}|GEMINI_API_KEY\s*=|YOUTUBE_API_KEY\s*=' -- ':!docs/superpowers/specs/2026-10-23-netlify-ai-proxy-design.md' || true`

Expected: no hay errores de espacios ni secretos versionados.

```bash
git add public/sw.js tests/pwa/build.test.ts tests/pwa/e2e.test.ts
git commit -m "test(pwa): verify private Netlify AI routes"
```

## Self-Review

- **Cobertura de especificación:** Tareas 1 y 2 implementan y validan ambas funciones y secretos del servidor; Tarea 3 migra el cliente; Tarea 4 elimina claves/desbloqueo PWA sin tocar Electron; Tarea 5 prueba bundle, Service Worker, offline y el flujo de Inicio sin ajustes.
- **Consistencia de interfaces:** Gemini siempre recibe `{ request }` y devuelve `{ text }`; YouTube recibe `{ query, maxResults }` y devuelve `{ videos }`; la PWA usa estos contratos en Tarea 3, los simula en Tarea 5 y los implementa antes en Tareas 1–2.
- **Riesgos no omitidos:** validación de contenido y tamaño, override de modelo, ausencia de secretos, cancelación/timeout, cacheo y filtración del bundle aparecen en Review Focus y sus tareas de prueba.
- **Proporción:** el plan deja la construcción exacta a los implementadores, pero fija rutas, firmas, respuestas, límites, comandos y tests de aceptación.

## Despliegue posterior al código

Después de que las tareas y la revisión de rama estén verdes, el propietario del sitio debe añadir en Netlify → **Project configuration → Environment variables** los secretos `GEMINI_API_KEY` y `YOUTUBE_API_KEY`, activar un nuevo deploy y comprobar desde un perfil limpio de ChromeOS que Inicio y Vídeos funcionan sin abrir Ajustes. Esta acción no forma parte del commit ni debe incluir los valores de las claves.
# EstudiaIA — IA sin desbloqueo mediante Netlify Functions

**Estado:** diseño aprobado para planificación

## Objetivo

Permitir que EstudiaIA funcione desde Inicio, Prácticas, Materias, Lecciones y Vídeos en cualquier Chromebook sin pedir una contraseña maestra ni una clave API en el dispositivo. Las claves de Gemini y YouTube vivirán exclusivamente como secretos del proyecto Netlify.

El modelo de IA del sitio será `gemini-3.5-flash-lite` y se seleccionará únicamente en el servidor.

## Contexto y problema actual

La PWA actual guarda `geminiKey` y `youtubeKey` cifradas en IndexedDB. El almacén comienza bloqueado por diseño; `providers-web.ts` intenta leer esas claves antes de llamar a Google, por lo que una pregunta desde Inicio falla hasta que una persona introduce la contraseña maestra en Ajustes.

Quitar el cifrado o incluir una clave API en el bundle resolvería la fricción, pero expondría la clave pública y permitiría abusar de su cuota. La solución es desplazar las llamadas que requieren claves a funciones de Netlify.

## Resultado para quien usa la app

- Abrir EstudiaIA en un Chromebook y preguntar desde Inicio funciona sin configuración previa.
- La app no muestra «Desbloquear claves», ni solicita claves de Gemini o YouTube para sus funciones normales.
- Vídeos funciona cuando el propietario del sitio haya configurado `YOUTUBE_API_KEY` en Netlify.
- Si falta una variable de entorno del servidor, la app muestra un mensaje claro de servicio no configurado; no pide una contraseña local.

## Arquitectura

```text
Navegador / PWA
  ├─ POST /.netlify/functions/gemini
  │    └─ Netlify Function
  │         ├─ valida cuerpo, tamaño y tipo de solicitud
  │         ├─ construye el prompt educativo permitido
  │         ├─ usa GEMINI_API_KEY del entorno del servidor
  │         └─ llama a Gemini con gemini-3.5-flash-lite
  └─ POST /.netlify/functions/youtube
       └─ Netlify Function
            ├─ valida consulta y límite
            └─ usa YOUTUBE_API_KEY del entorno del servidor
```

Las funciones devuelven únicamente datos de respuesta o códigos de error seguros. Nunca devuelven claves, URLs con claves ni mensajes sin filtrar del proveedor.

## Componentes y responsabilidades

### 1. Configuración versionada de Netlify

Crear `netlify.toml` con:

- comando de build: `npm run build:pwa`
- directorio publicado: `dist-pwa`
- directorio de funciones: `netlify/functions`
- Node 22, reforzado también por `.nvmrc`

La configuración existente del panel de Netlify debe coincidir, pero el archivo permite reconstruir el sitio sin depender de clics manuales.

### 2. Función Gemini

Crear `netlify/functions/gemini.mjs`.

Contrato de entrada:

```json
{
  "request": {
    "id": "id-seguro",
    "kind": "tutor | units | practice | lesson | plan | notes",
    "course": "7° básico",
    "question": "opcional según kind",
    "subjectId": "opcional según kind",
    "subjectName": "opcional",
    "unit": "opcional según kind",
    "context": "opcional",
    "examDate": "opcional según kind",
    "file": "opcional para notes"
  }
}
```

Reglas:

- Solo acepta `POST` y `Content-Type: application/json`.
- Reutiliza o traslada al servidor la validación de formato y los prompts educativos actuales.
- Limita el cuerpo, el texto y el archivo de apuntes al tamaño ya establecido por la app.
- Ignora cualquier modelo enviado por el cliente y fija `gemini-3.5-flash-lite` en el servidor.
- Usa `process.env.GEMINI_API_KEY`; si falta, devuelve un error seguro `SERVICE_NOT_CONFIGURED`.
- Aplica un timeout de 30 segundos y traduce los errores de Google a códigos seguros: `QUOTA`, `PROVIDER_ERROR`, `TIMEOUT`, `INVALID_FORMAT` y `SERVICE_NOT_CONFIGURED`.
- No debe contener ni registrar la clave en respuestas, excepciones o logs de aplicación.

### 3. Función YouTube

Crear `netlify/functions/youtube.mjs`.

Contrato de entrada:

```json
{ "query": "texto", "maxResults": 4 }
```

Reglas:

- Solo `POST`, consulta no vacía y máximo limitado entre 1 y 10.
- Usa `process.env.YOUTUBE_API_KEY`.
- Devuelve únicamente `{ id, title, thumbnail }` de vídeos válidos y embebibles.
- Si falta la variable, devuelve `SERVICE_NOT_CONFIGURED`; la interfaz de Vídeos muestra un mensaje claro y no solicita una clave local.

### 4. Cliente web de proveedores

Modificar `src/services/providers-web.ts` para que:

- `generate()` y `askGemini()` llamen a `/.netlify/functions/gemini` mediante `POST`.
- `searchYouTube()` y `searchVideos()` llamen a `/.netlify/functions/youtube` mediante `POST`.
- No lea `geminiKey` ni `youtubeKey` de IndexedDB.
- Mantenga cancelación, timeout y mapeo de errores para los módulos de UI existentes.
- No incluya `generativelanguage.googleapis.com`, `www.googleapis.com` ni parámetros `key=` en el bundle de producción.

### 5. Ajustes sin bloqueo de claves

Modificar `src/ui/settings-pwa.js`, `src/services/settings-web-store.ts` y el HTML relevante:

- Eliminar de la experiencia normal la contraseña maestra, botones de desbloqueo y campos de Gemini/YouTube.
- Eliminar acciones de comprobar, borrar o guardar claves de proveedor desde el navegador.
- Mantener preferencias no secretas que ya funcionen sin claves: voz y velocidad de lectura.
- Mostrar un estado simple: «IA del sitio lista» cuando las funciones respondan; ante error de configuración, indicar que la persona administradora debe revisar Netlify.
- No borrar automáticamente el IndexedDB cifrado existente: queda inactivo y no se lee, evitando pérdida inesperada de datos.

## Seguridad y límites

- Las claves se introducen manualmente solo en Netlify, bajo Variables ambientales:
  - `GEMINI_API_KEY` (obligatoria)
  - `YOUTUBE_API_KEY` (recomendada para Vídeos)
- Ninguna clave se añade a Git, `netlify.toml`, archivos de build, el Service Worker o JavaScript del navegador.
- Las funciones validan método, estructura, tipos y tamaño de entrada.
- La PWA es pública: ocultar la clave evita que se copie, pero no impide que visitantes consuman la cuota del servicio. El propietario debe configurar límites de cuota y alertas en Google para ambas APIs.
- No se implementa autenticación ni cobro en esta fase: el propósito es acceso libre para estudiantes. Si el uso público crece, el siguiente proyecto debe añadir control de abuso persistente antes de ampliar cuota.

## Migración y despliegue

1. Implementar y probar funciones y cliente sin añadir claves al repositorio.
2. Desplegar la rama `feat/estudiaia2` en Netlify.
3. En Netlify → Variables ambientales, añadir `GEMINI_API_KEY` y `YOUTUBE_API_KEY` como secretos del servidor.
4. Ejecutar un nuevo despliegue para que las funciones lean las variables.
5. Verificar desde un Chromebook nuevo: Inicio responde sin visitar Ajustes ni introducir ninguna contraseña.
6. Verificar que Vídeos busca resultados sin una clave en el navegador.

## Pruebas y criterios de aceptación

### Unitarias

- La función Gemini rechaza métodos no `POST`, cuerpos inválidos, tipos no permitidos y entradas demasiado grandes.
- La función Gemini fija `gemini-3.5-flash-lite` aunque el cliente intente mandar otro modelo.
- La función Gemini no llama al proveedor sin `GEMINI_API_KEY` y devuelve `SERVICE_NOT_CONFIGURED`.
- La función YouTube valida entrada y no llama al proveedor sin `YOUTUBE_API_KEY`.
- El cliente llama únicamente a rutas `/.netlify/functions/*` y mantiene los errores esperados por la UI.

### Build y seguridad

- `npm run build:pwa` termina correctamente.
- El contenido de `dist-pwa/` no contiene patrones de claves ni endpoints de Google con `key=`.
- El Service Worker no cachea las rutas de funciones ni respuestas de IA.

### Navegador/PWA

- Una instalación nueva abre Inicio y puede pedir una respuesta simulada de la función sin desbloquear Ajustes.
- La vista de Ajustes no contiene `#settings-master-password`, `#settings-gemini-key` ni `#settings-youtube-key`.
- La recarga offline sigue mostrando el shell de la PWA; las acciones de IA muestran un estado de conexión adecuado sin romper la interfaz.

## Fuera de alcance

- Autenticación de estudiantes, cuentas individuales, cuotas por alumno o pagos.
- Persistencia de rate limiting entre ejecuciones de funciones.
- Migración o descifrado de las claves existentes de IndexedDB.
- Claves API incrustadas en la app o el repositorio.

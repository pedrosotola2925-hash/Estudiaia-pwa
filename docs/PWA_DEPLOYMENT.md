# EstudiaIA PWA — Guía de Despliegue

## Resumen

Esta guía cubre el despliegue de la versión PWA de EstudiaIA (progressive web app) a producción. La PWA es una aplicación web autónoma que funciona offline, se puede instalar en el dispositivo y proporciona una experiencia similar a nativa.

La PWA se construye con **Vite + Workbox** y genera una carpeta `dist-pwa/` lista para servir como sitio estático. Requiere **HTTPS** (obligatorio para Service Workers y PWA).

---

## Requisitos Previos

| Requisito | Versión mínima | Notas |
|-----------|----------------|-------|
| Node.js | 22.12.0+ | Para `npm run build:pwa` |
| npm | 10+ | Incluido con Node |
| Dominio con HTTPS | — | Obligatorio para PWA (Service Worker, install prompt) |
| Cuenta en proveedor de hosting | — | Netlify, Vercel, Firebase, GitHub Pages, o servidor propio |

---

## Construcción Local

```bash
# Clonar repositorio
git clone <repo-url>
cd EstudiaIA-nueva

# Instalar dependencias
npm ci

# Construir PWA para producción
npm run build:pwa

# Resultado: carpeta `dist-pwa/` lista para desplegar
```

### Verificación local (opcional)

```bash
# Servir build con Python (HTTP plano, localhost es secure context)
python -m http.server 5173 --directory dist-pwa
# Abrir http://127.0.0.1:5173 en navegador
```

> **Nota**: En `localhost` (HTTP plano) los Service Workers funcionan porque `localhost` es un *secure context*. En cualquier otro dominio **se requiere HTTPS válido**.

---

## Objetivos de Despliegue

### 1. Netlify (arrastrar y soltar / Git)

**Opción A: Arrastrar carpeta `dist-pwa/`**
1. Ejecuta `npm run build:pwa`
2. Arrastra la carpeta `dist-pwa/` a https://app.netlify.com/drop

**Opción B: Conectar repositorio (CI/CD automático)**
1. Conecta el repo en Netlify
2. Build command: `npm run build:pwa`
3. Publish directory: `dist-pwa`
4. Netlify detecta `vite.config.ts` y configura headers automáticamente

**Headers recomendados** (`public/_headers` o `netlify.toml`):
```toml
[[headers]]
  for = "/sw.js"
  [headers.values]
    Cache-Control = "no-cache"
    Service-Worker-Allowed = "/"

[[headers]]
  for = "/manifest.webmanifest"
  [headers.values]
    Content-Type = "application/manifest+json"
```

---

### 2. Vercel

```bash
# Instalar CLI
npm i -g vercel

# Desplegar build local
vercel deploy dist-pwa --prod
```

O conecta el repo en https://vercel.com/new:
- Framework Preset: **Vite**
- Build Command: `npm run build:pwa`
- Output Directory: `dist-pwa`

**Configuración `vercel.json`** (opcional, para headers SW):
```json
{
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "no-cache" },
        { "key": "Service-Worker-Allowed", "value": "/" }
      ]
    },
    {
      "source": "/manifest.webmanifest",
      "headers": [
        { "key": "Content-Type", "value": "application/manifest+json" }
      ]
    }
  ]
}
```

---

### 3. Firebase Hosting

```bash
# Instalar CLI
npm i -g firebase-tools

# Iniciar proyecto
firebase init hosting
# Seleccionar "Use an existing project"
# Public directory: dist-pwa
# Configure as single-page app: Yes
# Set up automatic builds and deploys: No (manual)

# Desplegar
firebase deploy --only hosting
```

**`firebase.json`** generado:
```json
{
  "hosting": {
    "public": "dist-pwa",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      { "source": "**", "destination": "/index.html" }
    ],
    "headers": [
      {
        "source": "/sw.js",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache" },
          { "key": "Service-Worker-Allowed", "value": "/" }
        ]
      },
      {
        "source": "/manifest.webmanifest",
        "headers": [
          { "key": "Content-Type", "value": "application/manifest+json" }
        ]
      }
    ]
  }
}
```

---

### 4. GitHub Pages

```bash
# Construir
npm run build:pwa

# Crear rama gh-pages con el contenido de dist-pwa
git checkout --orphan gh-pages
git rm -rf .
cp -r dist-pwa/* .
git add .
git commit -m "Deploy PWA"
git push origin gh-pages --force
```

O usa **GitHub Actions** (`.github/workflows/pages.yml`):
```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: npm ci
      - run: npm run build:pwa
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist-pwa
```

**Configuración repo**: Settings → Pages → Source: `gh-pages` branch / `/(root)`.

---

### 5. Servidor Propio (nginx / Apache / Caddy)

#### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name estudiaia.tu-dominio.com;

    ssl_certificate /etc/letsencrypt/live/tu-dominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tu-dominio.com/privkey.pem;

    root /var/www/estudiaia/dist-pwa;
    index index.html;

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Service Worker: no cache, scope allowed
    location /sw.js {
        add_header Cache-Control "no-cache";
        add_header Service-Worker-Allowed "/";
        try_files $uri =404;
    }

    # Manifest
    location /manifest.webmanifest {
        add_header Content-Type "application/manifest+json";
    }

    # Assets estáticos: cache largo
    location ~* \.(js|css|png|svg|ico|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Seguridad
    add_header X-Content-Type-Options nosniff;
    add_header X-Frame-Options DENY;
    add_header Referrer-Policy strict-origin-when-cross-origin;
}
```

#### Caddy (automático HTTPS con Let's Encrypt)

```caddy
estudiaia.tu-dominio.com {
    root * /var/www/estudiaia/dist-pwa
    encode gzip zstd

    # SPA fallback
    try_files {path} {path}/ /index.html

    # SW headers
    header /sw.js Cache-Control "no-cache"
    header /sw.js Service-Worker-Allowed "/"

    # Manifest
    header /manifest.webmanifest Content-Type "application/manifest+json"

    # Assets cache
    @static {
        path *.js *.css *.png *.svg *.ico *.woff2
    }
    header @static Cache-Control "public, max-age=31536000, immutable"
}
```

---

## HTTPS Obligatorio

Los **Service Workers** y el **prompt de instalación PWA** solo funcionan en:
- `localhost` / `127.0.0.1` (HTTP plano permitido)
- Dominios con **HTTPS válido** (certificado TLS)

### Opciones para obtener HTTPS

| Método | Descripción |
|--------|-------------|
| **Let's Encrypt + Certbot** | Gratis, renovación automática cada 90 días |
| **Cloudflare** | Proxy naranja + SSL Full (strict), certificado automático |
| **Netlify / Vercel / Firebase** | HTTPS automático incluido |
| **Caddy** | HTTPS automático con Let's Encrypt integrado |

**Ejemplo Certbot (nginx):**
```bash
sudo certbot --nginx -d estudiaia.tu-dominio.com
# Renovación automática: systemctl enable certbot-renew.timer
```

---

## Edge-TTS Cloud Fallback (Opcional)

Si se desea voz premium en navegadores sin voz española nativa:

1. Desplegar `api/tts.ts` (serverless function) en Vercel/Netlify/Firebase Functions
2. Configurar variable de entorno en el build de la PWA:
   ```bash
   VITE_TTS_ENDPOINT=https://tu-funcion.vercel.app/api/tts npm run build:pwa
   ```
3. La PWA usará automáticamente el endpoint si el navegador no tiene voz `es-MX`/`es-CL`.

> **Nota**: La Tarea 7 del plan de migración decidió **omitir** este fallback por ahora (no hay target de despliegue seleccionado). Para habilitarlo, desplegar la función y recompilar con la variable de entorno.

---

## Testing en ChromeOS / Dispositivos Móviles

### Desarrollo local con túnel público

```bash
# Terminal 1: Vite dev server con HTTPS
npm run dev:pwa
# Vite usa certs/localhost.crt (auto-firmado)

# Terminal 2: ngrok para exponer localhost
ngrok http 5173
# Usa la URL https://xxxx.ngrok-free.app en el Chromebook/móvil
```

> **Advertencia**: El certificado auto-firmado de Vite muestra advertencia en navegador. Aceptar "Avanzado → Continuar" para probar. Para testing real sin advertencia, usar ngrok HTTPS o desplegar a staging.

### Checklist de testing en dispositivo

- [ ] PWA se instala desde el menú del navegador ("Instalar app")
- [ ] Funciona offline (desactivar Wi-Fi, recargar)
- [ ] Voz funciona (Web Speech API)
- [ ] Settings persisten tras recargar
- [ ] Iconos aparecen correctamente en launcher
- [ ] Splash screen (si configurado)
- [ ] Orientación portrait/landscape

---

## Variables de Entorno de Build

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `VITE_TTS_ENDPOINT` | Endpoint opcional Edge-TTS cloud | `https://api.tu-dominio.com/tts` |
| `NODE_ENV` | Modo de build (production) | `production` |

**Uso:**
```bash
VITE_TTS_ENDPOINT=https://api.example.com/tts npm run build:pwa
```

---

## Solución de Problemas Comunes

| Problema | Causa | Solución |
|----------|-------|----------|
| SW no registra | HTTP en dominio no-localhost | Usar HTTPS válido |
| SW registra pero no controla | `Service-Worker-Allowed` header faltante | Añadir header en servidor |
| Install prompt no aparece | No HTTPS / ya instalado / criteria no cumplidos | Verificar HTTPS, limpiar datos sitio |
| Iconos no se ven | Rutas incorrectas en manifest | Verificar `public/manifest.json` y `vite.config.ts` |
| Offline no funciona | SW no cachea recursos | Verificar `vite-plugin-pwa` config y `sw.js` |
| Voz no suena | Navegador sin voz es-MX/es-CL | Usar fallback Edge-TTS o voz local |

---

## Arquitectura de Build

```
npm run build:pwa
    │
    ├─ vite build (config: vite.config.ts)
    │    ├─ Compila TypeScript/JS → dist-pwa/assets/
    │    ├─ Copia public/ → dist-pwa/
    │    └─ Genera index.html con hash de assets
    │
    └─ vite-plugin-pwa (injectManifest)
         ├─ Lee public/sw.js (Workbox)
         ├─ Genera precache-manifest (hashes de assets)
         └─ Emite dist-pwa/sw.js listo para producción
```

**Archivos clave en `dist-pwa/`:**
- `index.html` — entry point SPA
- `sw.js` — Service Worker (Workbox) con precache + runtime caching
- `manifest.webmanifest` — Web App Manifest
- `assets/*.js` — módulos de la app (hasheados)
- `icon-*.png` — iconos PWA (72–512px)

---

## Referencias

- [MDN: Progressive Web Apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
- [Workbox Documentation](https://developer.chrome.com/docs/workbox/)
- [vite-plugin-pwa](https://vite-pwa-org.netlify.app/)
- [Web App Manifest spec](https://w3c.github.io/manifest/)
- [Service Worker spec](https://w3c.github.io/ServiceWorker/)

---

## Historial de Cambios

| Fecha | Versión | Cambios |
|-------|---------|---------|
| 2026-10-21 | 1.0.0 | Guía inicial para PWA EstudiaIA v2 |
# EstudiaIA 2

Tutor educativo para estudiantes de Chile (7° básico y superior) con voz mexicana (Dalia), prácticas, progreso por curso, planes de estudio, lecciones interactivas y búsqueda de vídeos.

## Instalación

Descarga y ejecuta `EstudiaIA-2.0.0-Setup.exe`. La instalación es por usuario (no requiere administrador) y se coloca bajo:

```
%LOCALAPPDATA%/Programs/EstudiaIA 2
```

La aplicación anterior de EstudiaIA no se modifica ni se sobrescribe.

## Requisitos

- Internet para: Gemini, YouTube, búsqueda de vídeos y síntesis de voz neuronal (Dalia).
- Claves de API propias: introdúcelas en **Ajustes**. Se guardan protegidas en este equipo, no dentro del instalador.
- Windows 10 o 11.

## Voces

- **Dalia — Español (México)** es la voz predeterminada. Requiere internet.
- Ritmo: -5%, Tono: +0 Hz, Volumen inicial: -10%.

## Privacidad

- Al preguntar o analizar un apunte, el contenido se envía a Google (Gemini / YouTube).
- Al usar Dalia o Catalina, el texto de la lectura se envía al servicio de voz de Microsoft.
- No envíes datos personales innecesarios.
- Las claves de API se guardan localmente en este equipo, nunca dentro del instalador ni compartidas.

## Límites

- Fotos/PDF: JPEG, PNG, WebP y PDF, hasta 4 MiB por archivo.
- Prácticas: exactamente 5 preguntas, 4 opciones cada una.
- Lecciones: 4 a 6 tarjetas y una pregunta final A/B.
- Pomodoro: 25 min de estudio, 5 de descanso corto, 15 de descanso largo tras cuatro bloques.
- Historial visible: últimas 20 prácticas.
- Caché de audio: máximo 50 archivos y 100 MB.

## Sin garantías

No hay promesas de gratuidad ilimitada, tamaño ni firma digital. Los servicios de IA pueden tener cuotas o costos según el proveedor.

## Soporte

Si algo falla, revisa **Ajustes** y prueba nuevamente con una clave válida y conexión a internet.

## Versión Web (PWA)

EstudiaIA 2 también está disponible como **Progressive Web App** que funciona en cualquier navegador moderno (Chrome, Edge, Firefox, Safari) y se puede instalar en el dispositivo como una app nativa.

### Construir la PWA

```bash
npm run build:pwa
# Resultado en dist-pwa/
```

### Despliegue rápido

| Plataforma | Comando |
|------------|---------|
| **Netlify** | Arrastrar carpeta `dist-pwa/` a https://app.netlify.com/drop |
| **Vercel** | `npx vercel deploy dist-pwa --prod` |
| **Firebase** | `firebase deploy --only hosting` (configurar `public: dist-pwa`) |
| **GitHub Pages** | Subir `dist-pwa/` a rama `gh-pages` |
| **nginx/Caddy** | Servir `dist-pwa/` con HTTPS + headers SW |

> **Requisito obligatorio**: HTTPS válido (certificado TLS). En `localhost` funciona con HTTP plano.

### Documentación completa

Ver [`docs/PWA_DEPLOYMENT.md`](docs/PWA_DEPLOYMENT.md) para guía detallada de despliegue, configuración de headers, Edge-TTS opcional y testing en ChromeOS/móvil.

### Desarrollo PWA local

```bash
npm run dev:pwa
# Abre https://localhost:5173 (certificado auto-firmado, aceptar en navegador)
```

### Testing en dispositivo móvil/ChromeOS

```bash
# Terminal 1: Vite dev server
npm run dev:pwa

# Terminal 2: túnel público
ngrok http 5173
# Usar la URL https://xxxx.ngrok-free.app en el dispositivo
```

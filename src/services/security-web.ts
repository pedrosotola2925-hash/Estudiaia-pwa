/**
 * Utilidades de rutas para la compilación web de EstudiaIA.
 *
 * En la PWA los recursos se sirven por HTTPS desde el host estático; no hay
 * protocolo Electron ni rutas del sistema de archivos expuestas al navegador.
 */

const environment = import.meta.env;

/** Base de la aplicación para recursos estáticos. */
export const APP_URL = environment.PROD ? '/' : '/src/ui/';

function invalidAssetPath(): never {
  throw new Error('Ruta de recurso no válida');
}

/**
 * Convierte una ruta de recurso relativa o absoluta en una ruta pública
 * normalizada. No permite protocolos, rutas UNC, escapes de directorio ni
 * separadores de Windows, que no son rutas válidas para el host estático.
 */
export function resolveAssetPath(url: string, baseDir: string = APP_URL): string {
  if (typeof url !== 'string' || typeof baseDir !== 'string' || !url.trim()) {
    return invalidAssetPath();
  }

  if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(url) || url.startsWith('//')) {
    return invalidAssetPath();
  }

  const pathname = url.split(/[?#]/, 1)[0];
  const normalizedBase = baseDir.split(/[?#]/, 1)[0]
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const candidate = pathname.startsWith('/')
    ? pathname
    : `/${normalizedBase}/${pathname}`;

  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return invalidAssetPath();
  }

  if (decoded.includes('\\') || decoded.includes('\0')) {
    return invalidAssetPath();
  }

  const segments = decoded.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return invalidAssetPath();
  }

  return `/${segments.join('/')}`;
}

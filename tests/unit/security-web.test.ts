import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('security-web', () => {
  it('APP_URL es la raíz en producción', async () => {
    vi.stubEnv('PROD', true);
    const { APP_URL } = await import('@services/security-web');

    expect(APP_URL).toBe('/');
  });

  it('resolveAssetPath mantiene las rutas públicas absolutas', async () => {
    const { resolveAssetPath } = await import('@services/security-web');

    expect(resolveAssetPath('/styles.css', '/app')).toBe('/styles.css');
  });
});

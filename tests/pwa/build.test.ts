import { describe, it, expect } from 'vitest';
import { build } from 'vite';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

describe('PWA build', () => {
  it('produces dist-pwa with index.html, manifest.json, sw.js, and all UI modules', async () => {
    const result = await build({ configFile: 'vite.config.ts', mode: 'production' });
    
    // Check output directory exists
    expect(existsSync('dist-pwa')).toBe(true);
    
    // Check required files exist
    expect(existsSync('dist-pwa/index.html')).toBe(true);
    expect(existsSync('dist-pwa/manifest.json')).toBe(true);
    expect(existsSync('dist-pwa/sw.js')).toBe(true);
    // A deployed worker must be revalidated instead of cached as a static asset.
    const hostingHeaders = readFileSync('dist-pwa/_headers', 'utf-8');
    expect(hostingHeaders).toMatch(/\/sw\.js\s+Cache-Control: no-cache/);
    
    // Check index.html has manifest link and PWA meta tags
    const indexHtml = readFileSync('dist-pwa/index.html', 'utf-8');
    expect(indexHtml).toContain('rel="manifest"');
    expect(indexHtml).toContain('manifest.json');
    expect(indexHtml).toContain('theme-color');
    expect(indexHtml).toContain('apple-mobile-web-app-capable');
    expect(indexHtml).toContain('id="install-btn"');
    expect(indexHtml).not.toContain('vite-plugin-pwa:register-sw');
    expect(indexHtml).not.toContain('/registerSW.js');
    // A clean checkout must bundle the tracked stylesheet, not depend on an
    // untracked duplicate under public/.
    expect(indexHtml).toMatch(/href="\/assets\/[^" ]+\.css"/);
    expect(indexHtml).not.toContain('href="/styles.css"');
    
    // Check manifest.json has required fields
    const manifest = JSON.parse(readFileSync('dist-pwa/manifest.json', 'utf-8'));
    expect(manifest.name).toBe('EstudiaIA 2');
    expect(manifest.short_name).toBe('EstudiaIA');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#f1f5f9');
    expect(manifest.theme_color).toBe('#3b82f6');
    expect(manifest.icons).toBeDefined();
    expect(manifest.icons.length).toBeGreaterThan(0);
    expect(manifest.shortcuts).toBeDefined();
    expect(manifest.categories).toContain('education');
    expect(manifest.categories).toContain('productivity');
    
    // Check sw.js has Workbox precache and runtime caching
    const swContent = readFileSync('dist-pwa/sw.js', 'utf-8');
    // Check for precache manifest injection (array of objects with revision and url)
    expect(swContent).toMatch(/"revision":/);
    expect(swContent).toMatch(/"url":/);
    // Check for runtime caching - cache names and hostnames (preserved in minified output)
    expect(swContent).toContain('youtube-thumbnails');
    expect(swContent).toContain('i.ytimg.com');
    // Authenticated Gemini GET URLs contain the user's API key. Never cache them,
    // and remove any sensitive entries left by previous Service Worker versions.
    expect(swContent).not.toContain('generativelanguage.googleapis.com');
    expect(swContent).toMatch(/caches\.delete\(["']gemini-api["']\)/);
    expect(swContent).toMatch(/indexedDB\.deleteDatabase\(["']workbox-expiration["']\)/);
    expect(swContent).toContain('navigationPreload');
    expect(swContent).toContain('skipWaiting');
    expect(swContent).toContain('clients.claim');
    
    // Check that UI modules are bundled (at least some JS files exist)
    const jsFiles = readdirSync('dist-pwa').filter(f => f.endsWith('.js'));
    expect(jsFiles.length).toBeGreaterThan(0);
    // The Materias unit button navigates to leccion: its renderer must ship.
    expect(readdirSync('dist-pwa/assets').some(f => /^leccion-[^/]+\.js$/.test(f))).toBe(true);
  }, 30_000);
});

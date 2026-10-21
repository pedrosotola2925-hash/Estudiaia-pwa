import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

describe('PWA icon generation', () => {
  it('generates every manifest icon from the EI source SVG', async () => {
    const source = readFileSync('build/icon.svg', 'utf8');
    expect(source).toContain('>EI</text>');
    expect(existsSync('scripts/generate-icons.cjs')).toBe(true);

    execFileSync(process.execPath, ['scripts/generate-icons.cjs'], {
      cwd: process.cwd(),
      stdio: 'pipe',
    });

    for (const size of sizes) {
      const target = join('public', `icon-${size}.png`);
      const metadata = await sharp(target).metadata();
      expect(metadata.width).toBe(size);
      expect(metadata.height).toBe(size);
      expect(metadata.format).toBe('png');
    }
  });
});

'use strict';

const { mkdir } = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'build', 'icon.svg');
const outputDir = path.join(root, 'public');

async function main() {
  await mkdir(outputDir, { recursive: true });
  await Promise.all(sizes.map(size => sharp(source)
    .resize(size, size)
    .png()
    .toFile(path.join(outputDir, `icon-${size}.png`))));
  console.log(`Generated ${sizes.length} PWA icons in ${outputDir}`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});

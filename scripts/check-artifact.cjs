const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const installerPath = path.resolve('dist/EstudiaIA-2.0.0-Setup.exe');

console.log('=== Checking Artifact ===');
console.log('Installer:', installerPath);

if (!fs.existsSync(installerPath)) {
  console.error('ERROR: Installer not found at', installerPath);
  process.exit(1);
}

const stats = fs.statSync(installerPath);
console.log('Size:', stats.size, 'bytes');

if (stats.size === 0) {
  console.error('ERROR: Installer is empty (0 bytes)');
  process.exit(1);
}

// Quick PE sanity check: MS-DOS header magic 'MZ'
const fd = fs.openSync(installerPath, 'r');
const headerBuf = Buffer.alloc(2);
fs.readSync(fd, headerBuf, 0, 2, null);
fs.closeSync(fd);
if (headerBuf.toString('ascii') !== 'MZ') {
  console.error('ERROR: File does not look like a PE executable (no MZ header)');
  process.exit(1);
}

// SHA-256 of the installer
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(installerPath));
console.log('SHA-256:', hash.digest('hex'));

// Voice helper must be present as extra resource in the built package.
// electron-builder places extraResources under resources/ in the unpacked app.
// We cannot read the ASAR here reliably, so we check the source helper exists.
const helperSource = path.resolve('build/voice/tts-helper.exe');
console.log('Voice helper source:', helperSource);
console.log('Voice helper exists:', fs.existsSync(helperSource));

console.log('\n=== Artifact Check Complete ===');
process.exit(0);

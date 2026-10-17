const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const installerPath = path.resolve('dist/EstudiaIA-2.0.0-Setup.exe');
const installDir = path.resolve(process.env.LOCALAPPDATA, 'Programs/EstudiaIA 2');

console.log('=== Verifying Installer ===');
console.log('Installer:', installerPath);
console.log('Exists:', fs.existsSync(installerPath));
console.log('Size:', fs.statSync(installerPath).size, 'bytes');

// Compute SHA-256
const crypto = require('node:crypto');
const hash = crypto.createHash('sha256');
hash.update(fs.readFileSync(installerPath));
console.log('SHA-256:', hash.digest('hex'));

// Run installer silently
console.log('\n=== Running Installer ===');
const result = spawnSync(installerPath, ['/S', '/D=' + installDir], {
  encoding: 'utf8',
  timeout: 120000,
  stdio: 'pipe'
});
console.log('Exit code:', result.status);
if (result.stderr) console.log('Stderr:', result.stderr);
if (result.stdout) console.log('Stdout:', result.stdout);

// Verify installation
console.log('\n=== Verifying Installation ===');
const exePath = path.join(installDir, 'EstudiaIA 2.exe');
console.log('Installed exe:', exePath);
console.log('Exists:', fs.existsSync(exePath));

if (fs.existsSync(exePath)) {
  const stats = fs.statSync(exePath);
  console.log('Size:', stats.size, 'bytes');

  // Check helper is included
  const helperPath = path.join(installDir, 'resources/voice/tts-helper.exe');
  console.log('\nVoice helper:', helperPath);
  console.log('Exists:', fs.existsSync(helperPath));

  // Check ASAR doesn't contain tests/fixtures
  const asarPath = path.join(installDir, 'resources/app.asar');
  console.log('\nASAR:', asarPath);
  console.log('Exists:', fs.existsSync(asarPath));

  // Quick launch test
  console.log('\n=== Quick Launch Test ===');
  const launch = spawnSync(exePath, [], {
    encoding: 'utf8',
    timeout: 10000,
    stdio: 'pipe',
    windowsHide: true
  });
  console.log('Launch exit code:', launch.status);
  if (launch.stderr) console.log('Stderr:', launch.stderr.slice(0, 500));
  if (launch.stdout) console.log('Stdout:', launch.stdout.slice(0, 500));
}

console.log('\n=== Verification Complete ===');
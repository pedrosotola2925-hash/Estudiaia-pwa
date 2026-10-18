'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'electron-builder.json'), 'utf8'));

test('electron-builder config has the required app identity', () => {
  assert.equal(config.appId, 'cl.estudiaia.desktop.v2');
  assert.equal(config.productName, 'EstudiaIA 2');
});

test('electron-builder targets NSIS per-user installer', () => {
  assert.equal(config.win.target[0].target, 'nsis');
  assert.equal(config.nsis.perMachine, false);
});

test('electron-builder artifact name matches the spec', () => {
  assert.equal(config.artifactName, 'EstudiaIA-2.0.0-Setup.exe');
});

test('electron-builder extra resources include the voice helper', () => {
  assert.deepEqual(config.extraResources, [{ from: 'build/voice/tts-helper.exe', to: 'voice/tts-helper.exe' }]);
});

test('electron-builder excludes tests and env files from the package', () => {
  assert.equal(config.files.includes('!tests/**'), true);
  assert.equal(config.files.includes('!**/.env*'), true);
});

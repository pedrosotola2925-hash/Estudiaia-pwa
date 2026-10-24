const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const settingsSource = fs.readFileSync(
  path.resolve(__dirname, '../../src/ui/settings-pwa.js'),
  'utf8'
);

class FakeOption {
  constructor(text, value) {
    this.text = text;
    this.value = value;
  }
}

test('PWA settings expose one Mexican-preferred browser voice with a Spanish fallback', () => {
  const voiceSelect = {
    children: [],
    value: '',
    replaceChildren(...children) {
      this.children = children;
    },
  };
  const elements = new Map([
    ['settings-rate', { value: '' }],
    ['rate-label', { textContent: '' }],
    ['connection-status', { textContent: '' }],
    ['voice-select', voiceSelect],
    ['settings-rate', { value: '' }],
    ['settings-form', {}],
    ['settings-save', { disabled: false }],
    ['settings-status', {}],
  ]);
  const browserVoices = [
    { name: 'Mexican voice', lang: 'es-MX' },
    { name: 'Chilean voice', lang: 'es-CL' },
    { name: 'Spanish voice', lang: 'es-ES' },
  ];
  const settings = { saveSettings: async patch => patch };
  const app = {
    context: {
      settings,
      voice: {
        getVoices: () => browserVoices,
        onVoiceChange() {},
        stop() {},
      },
    },
    settings: { voice: 'es-MX-DaliaNeural', rate: 0 },
    features: {},
    ui: { guard: callback => callback, message() {} },
  };

  vm.runInNewContext(settingsSource, {
    window: { Estudia: app },
    document: { getElementById: id => elements.get(id) },
    Option: FakeOption,
  });
  app.features.ajustes.init();

  assert.equal(voiceSelect.children.length, 1);
  assert.equal(voiceSelect.children[0].value, 'es-MX-DaliaNeural');
  assert.match(voiceSelect.children[0].text, /México.*respaldo en español/i);
  assert.equal(voiceSelect.value, 'es-MX-DaliaNeural');
});

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { createVoiceServiceWeb } from '@services/voice-web';

const mockVoices = [
  { name: 'Google es-MX', lang: 'es-MX', localService: true, voiceURI: 'Google es-MX', default: false },
  { name: 'Google es-419', lang: 'es-419', localService: true, voiceURI: 'Google es-419', default: false },
  { name: 'Google en-US', lang: 'en-US', localService: true, voiceURI: 'Google en-US', default: true },
];

let synth: SpeechSynthesis;
let service: ReturnType<typeof createVoiceServiceWeb>;

class MockUtterance {
  text = '';
  lang = '';
  voice: SpeechSynthesisVoice | null = null;
  rate = 1;
  pitch = 1;
  onend: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  onerror: ((this: SpeechSynthesisUtterance, ev: SpeechSynthesisEvent) => void) | null = null;
  start = vi.fn();
  constructor(text?: string) { if (text) this.text = text; }
}

beforeAll(() => {
  synth = {
    getVoices: vi.fn(() => mockVoices as SpeechSynthesisVoice[]),
    speak: vi.fn(),
    cancel: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as SpeechSynthesis;

  vi.stubGlobal('window', {
    speechSynthesis: synth,
    SpeechSynthesisUtterance: MockUtterance,
    addEventListener: vi.fn(),
  } as unknown as Window & typeof globalThis);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.clearAllMocks();
  service = createVoiceServiceWeb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('voice-web', () => {
  it('getVoices returns available voices', () => {
    const voices = service.getVoices();
    expect(voices.length).toBe(3);
    expect(voices[0].lang).toBe('es-MX');
  });

  it('prefers es-MX or es-419 voice', () => {
    const voices = service.getVoices();
    const preferred = voices.find(v => v.lang === 'es-MX' || v.lang === 'es-419');
    expect(preferred).toBeDefined();
    expect(preferred?.lang).toMatch(/es/);
  });

  it('isCloudAvailable returns false initially', () => {
    expect(service.isCloudAvailable()).toBe(false);
  });

  it('stop calls cancel on synthesis', () => {
    service.stop();
    expect(synth.cancel).toHaveBeenCalled();
  });

  it('pause calls pause on synthesis', () => {
    service.pause();
    expect(synth.pause).toHaveBeenCalled();
  });

  it('resume calls resume on synthesis', () => {
    service.resume();
    expect(synth.resume).toHaveBeenCalled();
  });

  it('onVoiceChange registers voiceschanged listener', () => {
    const cb = vi.fn();
    service.onVoiceChange(cb);
    expect(synth.addEventListener).toHaveBeenCalledWith('voiceschanged', cb);
  });

  it('speak resolves after utterance ends', async () => {
    const utterances: any[] = [];
    (synth.speak as unknown as vi.Mock).mockImplementation((utt: any) => {
      utterances.push(utt);
      setTimeout(() => utt.onend?.(new Event('end') as any), 10);
    });

    await service.speak('Hola mundo.');
    expect(synth.speak).toHaveBeenCalled();
    expect(utterances[0].text).toContain('Hola');
  });

  it('speak rejects when synthesis is unavailable', async () => {
    vi.unstubAllGlobals();
    const svc = createVoiceServiceWeb();
    await expect(svc.speak('test')).rejects.toThrow(/not available/i);
    vi.stubGlobal('window', {
      speechSynthesis: synth,
      SpeechSynthesisUtterance: MockUtterance,
      addEventListener: vi.fn(),
    } as unknown as Window & typeof globalThis);
  });
});

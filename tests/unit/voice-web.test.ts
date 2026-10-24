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

  it('speaks using the Mexican browser voice when available', async () => {
    let utterance: any;
    const getVoices = vi.mocked(synth.getVoices);
    const speak = vi.mocked(synth.speak);
    const spainVoice = {
      name: 'Spanish Spain',
      lang: 'es-ES',
      localService: true,
      voiceURI: 'Spanish Spain',
      default: true,
    } as SpeechSynthesisVoice;
    getVoices.mockReturnValue([spainVoice, mockVoices[1], mockVoices[0]] as SpeechSynthesisVoice[]);
    speak.mockImplementation((value: any) => {
      utterance = value;
      queueMicrotask(() => value.onend?.(new Event('end') as any));
    });

    try {
      await service.speak('Hola mundo.');
      expect(utterance.voice?.lang).toBe('es-MX');
    } finally {
      getVoices.mockReturnValue(mockVoices as SpeechSynthesisVoice[]);
      speak.mockReset();
    }
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

  it('falls back to a Spanish browser voice only when Mexican Spanish is unavailable', async () => {
    let utterance: any;
    const getVoices = vi.mocked(synth.getVoices);
    const speak = vi.mocked(synth.speak);
    const latinAmericanVoice = {
      name: 'Latin American Spanish',
      lang: 'es-419',
      localService: true,
      voiceURI: 'Latin American Spanish',
      default: false,
    } as SpeechSynthesisVoice;
    const spainVoice = {
      name: 'Spanish Spain',
      lang: 'es-ES',
      localService: true,
      voiceURI: 'Spanish Spain',
      default: true,
    } as SpeechSynthesisVoice;
    const cases = [
      { voices: [latinAmericanVoice, spainVoice], expected: 'es-419' },
      { voices: [spainVoice], expected: 'es-ES' },
    ];
    speak.mockImplementation((value: any) => {
      utterance = value;
      queueMicrotask(() => value.onend?.(new Event('end') as any));
    });

    try {
      for (const scenario of cases) {
        getVoices.mockReturnValue(scenario.voices);
        await service.speak('Hola mundo.');
        expect(utterance.voice?.lang).toBe(scenario.expected);
      }
    } finally {
      getVoices.mockReturnValue(mockVoices as SpeechSynthesisVoice[]);
      speak.mockReset();
    }
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

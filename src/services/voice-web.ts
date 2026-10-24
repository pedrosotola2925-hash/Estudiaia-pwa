/**
 * Web Speech API voice service for EstudiaIA PWA.
 * Pure browser TTS, no Electron IPC, no credentials, no secure storage needed.
 *
 * Features:
 * - window.speechSynthesis primary engine
 * - Prefers Spanish Mexico (es-MX), then Latin American Spanish or another Spanish voice
 * - Chunks text at sentence boundaries, max 480 chars per utterance
 * - Sequential playback via onend chain
 * - stop / pause / resume controls
 */

export interface VoiceOptions {
  rate?: number;
}

export interface VoiceService {
  speak(text: string, options?: VoiceOptions): Promise<void>;
  stop(): void;
  pause(): void;
  resume(): void;
  getVoices(): SpeechSynthesisVoice[];
  onVoiceChange(callback: () => void): void;
  isCloudAvailable(): boolean;
}

const MAX_CHUNK_CHARS = 480;

function splitIntoChunks(text: string): string[] {
  const result: string[] = [];
  let current = '';
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];

  const flush = () => {
    if (current.trim()) result.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    for (const word of sentence.trim().split(/\s+/)) {
      if (!word) continue;
      if (word.length > MAX_CHUNK_CHARS) {
        flush();
        let remaining = word;
        while (remaining.length > MAX_CHUNK_CHARS) {
          result.push(remaining.slice(0, MAX_CHUNK_CHARS));
          remaining = remaining.slice(MAX_CHUNK_CHARS);
        }
        current = remaining;
        continue;
      }
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length > MAX_CHUNK_CHARS && current) {
        flush();
        current = word;
      } else {
        current = candidate;
      }
    }
  }
  flush();
  return result;
}

export function createVoiceServiceWeb(): VoiceService {
  let synth: SpeechSynthesis | null = null;
  let queue: string[] = [];
  let speaking = false;
  let currentUtterance: SpeechSynthesisUtterance | null = null;

  function getSynth(): SpeechSynthesis {
    if (!synth) {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        throw new Error('Speech synthesis not available');
      }
      synth = window.speechSynthesis;
    }
    return synth;
  }

  function speak(text: string, options: VoiceOptions = {}): Promise<void> {
    return new Promise((resolve, reject) => {
      const s = getSynth();
      s.cancel();
      queue = splitIntoChunks(text);
      speaking = true;
      currentUtterance = null;

      const next = (): void => {
        if (!speaking || queue.length === 0) {
          speaking = false;
          currentUtterance = null;
          resolve();
          return;
        }

        const chunk = queue.shift()!;
        const voices = s.getVoices();
        const preferred =
          voices.find(v => v.lang.toLowerCase().startsWith('es-mx')) ||
          voices.find(v => v.lang.toLowerCase().startsWith('es-419')) ||
          voices.find(v => v.lang.toLowerCase().startsWith('es'));
        if (!preferred) {
          speaking = false;
          queue = [];
          currentUtterance = null;
          reject(new Error('No hay una voz en español disponible en este navegador.'));
          return;
        }

        const utterance = new (window as unknown as { SpeechSynthesisUtterance: typeof SpeechSynthesisUtterance }).SpeechSynthesisUtterance(chunk);
        utterance.voice = preferred;
        utterance.lang = preferred.lang;
        utterance.rate = options.rate ?? 1;
        utterance.pitch = 1;

        utterance.onend = () => {
          currentUtterance = null;
          next();
        };

        utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
          currentUtterance = null;
          speaking = false;
          reject(new Error(`Speech error: ${e.error}`));
        };

        currentUtterance = utterance;
        s.speak(utterance);
      };

      next();
    });
  }

  function stop(): void {
    speaking = false;
    queue = [];
    currentUtterance = null;
    getSynth().cancel();
  }

  function pause(): void {
    getSynth().pause();
  }

  function resume(): void {
    getSynth().resume();
  }

  function getVoices(): SpeechSynthesisVoice[] {
    return getSynth().getVoices();
  }

  function onVoiceChange(callback: () => void): void {
    getSynth().addEventListener('voiceschanged', callback);
  }

  function isCloudAvailable(): boolean {
    return false;
  }

  return { speak, stop, pause, resume, getVoices, onVoiceChange, isCloudAvailable };
}

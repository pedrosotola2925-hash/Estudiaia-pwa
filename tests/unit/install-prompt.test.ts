import { describe, expect, it, vi } from 'vitest';
import { createInstallPrompt } from '@ui/install-prompt.js';

type Listener = (event?: unknown) => unknown;

function setup() {
  const windowListeners = new Map<string, Listener>();
  const buttonListeners = new Map<string, Listener>();
  const button = {
    hidden: true,
    addEventListener: vi.fn((event: string, listener: Listener) => buttonListeners.set(event, listener)),
  };
  const windowRef = {
    addEventListener: vi.fn((event: string, listener: Listener) => windowListeners.set(event, listener)),
  };
  return { button, buttonListeners, windowListeners, windowRef };
}

describe('Install prompt', () => {
  it('shows the install button after beforeinstallprompt and hides it after acceptance', async () => {
    const fixture = setup();
    createInstallPrompt({ windowRef: fixture.windowRef, button: fixture.button });
    const deferredEvent = {
      preventDefault: vi.fn(),
      prompt: vi.fn(async () => undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    };

    fixture.windowListeners.get('beforeinstallprompt')?.(deferredEvent);
    expect(deferredEvent.preventDefault).toHaveBeenCalledOnce();
    expect(fixture.button.hidden).toBe(false);

    await fixture.buttonListeners.get('click')?.();
    expect(deferredEvent.prompt).toHaveBeenCalledOnce();
    expect(fixture.button.hidden).toBe(true);
  });
});

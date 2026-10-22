import { afterEach, describe, expect, it, vi } from 'vitest';

class ElementStub {
  children: ElementStub[] = [];
  dataset: Record<string, string> = {};
  className = '';
  textContent = '';
  disabled = false;
  append(...nodes: ElementStub[]) { this.children.push(...nodes); }
  replaceChildren(...nodes: ElementStub[]) { this.children = nodes; }
  setAttribute(_name: string, _value: string) {}
}

afterEach(() => vi.unstubAllGlobals());

describe('Materias in the PWA module bundle', () => {
  it('renders a subject card under ES module strict mode', async () => {
    const container = new ElementStub();
    const E = {
      features: {} as Record<string, { render(): void }>,
      Core: { SUBJECTS: [{ id: 'matematica', nombre: 'Matemáticas', emoji: '📐' }] },
      course: () => '7º básico',
      ui: {
        el: (_tag: string, text = '', className = '') => Object.assign(new ElementStub(), { textContent: text, className }),
        button: (_label: string, _action: () => unknown) => new ElementStub(),
      },
    };
    vi.stubGlobal('window', { Estudia: E });
    vi.stubGlobal('document', { getElementById: () => container });

    await import('@ui/materias.js');
    E.features.materias.render();

    expect(container.children[1]?.children).toHaveLength(1);
    expect(container.children[1].children[0].dataset.subject).toBe('matematica');
  });
});

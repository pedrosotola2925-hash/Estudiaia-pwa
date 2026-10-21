import { describe, expect, it } from 'vitest';
import { createAppContext } from '@services/app-context';

describe('app-context', () => {
  it('creates context with all services', () => {
    const ctx = createAppContext();

    expect(ctx.settings).toBeDefined();
    expect(ctx.voice).toBeDefined();
    expect(ctx.providers).toBeDefined();
    expect(ctx.router).toBeDefined();
    expect(ctx.store).toBeDefined();
  });
});

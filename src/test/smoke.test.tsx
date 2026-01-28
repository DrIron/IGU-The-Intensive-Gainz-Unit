import { describe, it, expect } from 'vitest';

/**
 * Smoke tests - basic sanity checks
 * These run on every PR to catch obvious breaks
 */
describe('Smoke Tests', () => {
  it('should pass basic assertions', () => {
    expect(true).toBe(true);
    expect(1 + 1).toBe(2);
  });

  it('should handle arrays', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });

  it('should handle objects', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj.name).toBe('test');
    expect(obj.value).toBeGreaterThan(0);
  });
});

describe('Module imports', () => {
  it('should import utility functions', async () => {
    // Test that core utilities can be imported
    const { cn } = await import('@/lib/utils');
    expect(cn).toBeDefined();
    expect(typeof cn).toBe('function');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIRST_VISIT_STORAGE_KEY, readFirstVisitAcknowledgement, writeFirstVisitAcknowledgement } from './firstVisitStorage';

beforeEach(() => window.localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe('first visit acknowledgement', () => {
  it('keeps the existing v1 acknowledgement compatible', () => {
    window.localStorage.setItem('swelldays:first-visit:v1', 'seen');
    expect(readFirstVisitAcknowledgement()).toBe(true);
  });
  it('writes a completed visit to the same key', () => {
    writeFirstVisitAcknowledgement();
    expect(window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY)).toBe('seen');
  });
  it('keeps entry available when storage cannot be read or written', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    expect(readFirstVisitAcknowledgement()).toBe(false);
    expect(() => writeFirstVisitAcknowledgement()).not.toThrow();
  });
});

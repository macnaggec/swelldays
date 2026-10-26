import { describe, expect, it } from 'vitest';
import { firstVisitEntryReducer, type FirstVisitEntryState } from './firstVisitEntry';

const reading: FirstVisitEntryState = { phase: 'reading', mapStatus: 'loading' };

describe('first visit map entry', () => {
  it('keeps reading separate from a pending request to enter', () => {
    expect(firstVisitEntryReducer(reading, { type: 'enter' })).toEqual({ phase: 'waiting', mapStatus: 'loading' });
  });
  it('reveals only after a requested map has become ready', () => {
    const waiting = firstVisitEntryReducer(reading, { type: 'enter' });
    expect(firstVisitEntryReducer(waiting, { type: 'ready' })).toEqual({ phase: 'revealing', mapStatus: 'ready' });
    expect(firstVisitEntryReducer(reading, { type: 'ready' }).phase).toBe('reading');
  });
  it('does not complete a visit before the reveal finishes', () => {
    expect(firstVisitEntryReducer(reading, { type: 'revealed' })).toEqual(reading);
    const ready = firstVisitEntryReducer(reading, { type: 'ready' });
    const revealing = firstVisitEntryReducer(ready, { type: 'enter' });
    expect(revealing.phase).toBe('revealing');
    expect(firstVisitEntryReducer(revealing, { type: 'revealed' }).phase).toBe('map');
  });
  it('returns to readable content when the map fails during entry', () => {
    const waiting = firstVisitEntryReducer(reading, { type: 'enter' });
    const failed = firstVisitEntryReducer(waiting, { type: 'failed' });
    expect(failed).toEqual({ phase: 'reading', mapStatus: 'error' });
    expect(firstVisitEntryReducer(failed, { type: 'revealed' })).toEqual(failed);
    expect(firstVisitEntryReducer(failed, { type: 'enter' })).toEqual(failed);
    expect(firstVisitEntryReducer(failed, { type: 'retry' })).toEqual(reading);
  });
  it('lets a visitor cancel waiting and keep reading', () => {
    const waiting = firstVisitEntryReducer(reading, { type: 'enter' });
    const cancelled = firstVisitEntryReducer(waiting, { type: 'cancel' });
    expect(firstVisitEntryReducer(cancelled, { type: 'ready' }).phase).toBe('reading');
  });
  it('can replay intro/map history without losing map readiness or completing a new entry', () => {
    const ready = firstVisitEntryReducer(reading, { type: 'ready' });
    const hidden = firstVisitEntryReducer(ready, { type: 'hide' });
    expect(hidden.phase).toBe('map');
    expect(firstVisitEntryReducer(hidden, { type: 'show' })).toEqual(ready);
  });
});

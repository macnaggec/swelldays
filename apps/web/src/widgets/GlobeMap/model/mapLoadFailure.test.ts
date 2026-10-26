import { describe, expect, it } from 'vitest';
import { classifyMapLoadFailure } from './mapLoadFailure';

describe('map initialization failures', () => {
  it('keeps unknown errors and individual tile errors recoverable', () => {
    const unknown = new Error('Network error');
    expect(classifyMapLoadFailure(unknown)).toEqual({ error: unknown, fatal: false });
    expect(classifyMapLoadFailure(Object.assign(new Error('Forbidden'), { status: 403, url: 'https://api.mapbox.com/v4/satellite/0/0/0.jpg' })).fatal).toBe(false);
  });
  it('identifies an unavailable root style without confusing sprite failures with it', () => {
    const style = Object.assign(new Error('Forbidden'), { status: 403, url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12?access_token=example' });
    expect(classifyMapLoadFailure(style)).toEqual({ error: style, fatal: true });
    expect(classifyMapLoadFailure(Object.assign(new Error('Not found'), { status: 404, url: 'https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/sprite.json' })).fatal).toBe(false);
    expect(classifyMapLoadFailure(Object.assign(new Error('Rate limited'), { status: 429, url: style.url })).fatal).toBe(false);
  });
  it('recognizes failed WebGL initialization as fatal', () => {
    expect(classifyMapLoadFailure(new Error('Failed to initialize WebGL')).fatal).toBe(true);
  });
});

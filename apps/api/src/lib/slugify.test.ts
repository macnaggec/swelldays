import { describe, expect, it } from 'vitest';
import { slugify } from './slugify';

describe('slugify', () => {
  it('lowercases a single-word name', () => {
    expect(slugify('Uluwatu')).toBe('uluwatu');
  });

  it('hyphenates a multi-word name', () => {
    expect(slugify('Bali Soul')).toBe('bali-soul');
  });

  it('collapses repeated separators and non-alphanumeric characters into one hyphen', () => {
    expect(slugify("Padang  Padang's Reef!!")).toBe('padang-padang-s-reef');
  });

  it('trims leading and trailing hyphens', () => {
    expect(slugify('  -Uluwatu-  ')).toBe('uluwatu');
  });
});

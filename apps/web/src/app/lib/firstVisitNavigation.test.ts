import { describe, expect, it } from 'vitest';
import { firstVisitReturnHref } from './firstVisitNavigation';
describe('presentation return address', () => {
  it.each(['//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', undefined])('rejects an external or invalid return value %s', (value) => {
    expect(firstVisitReturnHref(value)).toBeUndefined();
  });
  it('keeps a local spot, query and fragment intact', () => {
    expect(firstVisitReturnHref('/uluwatu?date=today#photos')).toBe('/uluwatu?date=today#photos');
  });
  it('does not return into the same presentation loop', () => {
    expect(firstVisitReturnHref('/?firstVisitReview=1#intro')).toBe('/?firstVisitReview=1#map');
  });
});

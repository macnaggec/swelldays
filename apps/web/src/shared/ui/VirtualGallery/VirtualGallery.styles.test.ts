import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const virtualGalleryCss = readFileSync(
  'apps/web/src/shared/ui/VirtualGallery/VirtualGallery.module.css',
  'utf8',
);

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return virtualGalleryCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('VirtualGallery spacing', () => {
  it('uses the side inset at date boundaries without doubling the gap between card rows', () => {
    expect(cssRule('.divider')).toContain('align-items: flex-start');
    expect(cssRule('.mediaRow')).toContain(
      'padding: calc(var(--wa-panel-grid-gap) / 2) var(--wa-panel-content-inset)',
    );
    expect(cssRule('.mediaRow[data-section-start]')).toContain(
      'padding-block-start: var(--wa-panel-content-inset)',
    );
    expect(cssRule('.mediaRow[data-section-end]')).toContain(
      'padding-block-end: calc(var(--wa-panel-content-inset) - 4px)',
    );
  });
});

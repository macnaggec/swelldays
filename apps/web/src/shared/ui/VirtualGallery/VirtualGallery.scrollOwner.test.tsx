import { render } from 'test/setup/render';
import { describe, expect, it } from 'vitest';
import type { GalleryRow } from 'shared/lib/buildGalleryRows';
import { PanelLayout } from 'shared/ui/PanelLayout';
import { VirtualGallery } from './VirtualGallery';

type Item = { id: string };

function mediaRow(id: string): GalleryRow<Item> {
  return { type: 'media', items: [{ id }], key: `media-${id}` };
}

describe('VirtualGallery scroll-owner continuity', () => {
  it('keeps the same single panel scroll owner across a column-count change (shell crossing)', () => {
    const rows = [mediaRow('a'), mediaRow('b'), mediaRow('c')];
    const { container, rerender } = render(
      <PanelLayout>
        <VirtualGallery rows={rows} columns={1} renderCard={() => null} />
      </PanelLayout>,
    );

    expect(container.querySelectorAll('[data-panel-scroll-owner]')).toHaveLength(1);
    const owner = container.querySelector('[data-panel-scroll-owner]');

    // A shell/band crossing changes measured width, which changes column count
    // (F12k), which rebuilds rows with different chunk boundaries — the scroll
    // owner is PanelLayout's, above VirtualGallery, and must not move or duplicate.
    const recolumned = [{ type: 'media' as const, items: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], key: 'media-a' }];
    rerender(
      <PanelLayout>
        <VirtualGallery rows={recolumned} columns={3} renderCard={() => null} />
      </PanelLayout>,
    );

    expect(container.querySelectorAll('[data-panel-scroll-owner]')).toHaveLength(1);
    expect(container.querySelector('[data-panel-scroll-owner]')).toBe(owner);
  });

  it('never has more than one scroll owner across an unmount/remount (Feed/Gallery section switch)', () => {
    const rows = [mediaRow('a')];
    const { container, rerender } = render(
      <PanelLayout>
        <VirtualGallery rows={rows} renderCard={() => null} />
      </PanelLayout>,
    );

    expect(container.querySelectorAll('[data-panel-scroll-owner]')).toHaveLength(1);
    const ownerBeforeSwitch = container.querySelector('[data-panel-scroll-owner]');

    // PanelLayout is mounted once at the shell level, above the route Outlet — a
    // Feed/Gallery switch unmounts VirtualGallery, not PanelLayout.
    rerender(<PanelLayout>{'Feed content'}</PanelLayout>);
    expect(container.querySelectorAll('[data-panel-scroll-owner]')).toHaveLength(1);
    expect(container.querySelector('[data-panel-scroll-owner]')).toBe(ownerBeforeSwitch);

    rerender(
      <PanelLayout>
        <VirtualGallery rows={rows} renderCard={() => null} />
      </PanelLayout>,
    );
    expect(container.querySelectorAll('[data-panel-scroll-owner]')).toHaveLength(1);
    expect(container.querySelector('[data-panel-scroll-owner]')).toBe(ownerBeforeSwitch);
  });

  it('starts at the top on mount instead of inheriting the shared scroll owner\'s position from whatever section was showing before (Feed/Gallery section switch)', () => {
    const rows = [mediaRow('a')];
    const { container, rerender } = render(
      <PanelLayout>
        <VirtualGallery rows={rows} renderCard={() => null} />
      </PanelLayout>,
    );

    const owner = container.querySelector<HTMLElement>('[data-panel-scroll-owner]');
    if (!owner) throw new Error('Panel scroll owner must render.');

    // Feed leaves the shared owner scrolled part-way down, then the user
    // switches back to Gallery — VirtualGallery unmounts and remounts, but
    // the owner itself is the same persistent node (see the test above), so
    // its scrollTop survives the switch unless something resets it.
    rerender(<PanelLayout>{'Feed content'}</PanelLayout>);
    owner.scrollTop = 200;
    expect(owner.scrollTop).toBe(200);

    rerender(
      <PanelLayout>
        <VirtualGallery rows={rows} renderCard={() => null} />
      </PanelLayout>,
    );

    expect(owner.scrollTop).toBe(0);
  });
});

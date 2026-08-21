import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { PanelLayout, PanelLayoutStickyChrome } from './PanelLayout';
import { PanelGalleryLayout } from './PanelGalleryLayout';

function renderInPanelLayout(children: ReactNode) {
  return render(<PanelLayout>{children}</PanelLayout>);
}

describe('PanelGalleryLayout', () => {
  it('separates metadata, gallery content, and footer actions inside a panel body', () => {
    renderInPanelLayout(
      <PanelGalleryLayout
        meta={<span>Session metadata</span>}
        footer={<button type="button">Checkout</button>}
      >
        <div>Gallery cards</div>
      </PanelGalleryLayout>,
    );

    expect(screen.getByText('Session metadata').closest('[data-panel-gallery-meta]')).not.toBeNull();
    expect(screen.getByText('Gallery cards').closest('[data-panel-gallery-inset]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Checkout' }).closest('[data-panel-layout-footer]')).not.toBeNull();
  });

  it('places footer actions in the PanelLayout footer outside the gallery scroll owner', () => {
    renderInPanelLayout(
      <PanelGalleryLayout footer={<button type="button">Checkout</button>}>
        <div>Gallery cards</div>
      </PanelGalleryLayout>,
    );

    const footer = screen.getByRole('button', { name: 'Checkout' }).closest(
      '[data-panel-layout-footer]',
    );
    const galleryCards = screen.getByText('Gallery cards');

    expect(footer).not.toBeNull();
    expect(footer?.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(galleryCards.closest('[data-panel-scroll-owner]')).not.toBeNull();
  });

  it('renders route-owned panel chrome in the overlay beside the gallery scroll owner', () => {
    renderInPanelLayout(
      <>
        <PanelLayoutStickyChrome>
          <div>Collection tabs</div>
        </PanelLayoutStickyChrome>
        <PanelGalleryLayout>
          <div>Gallery cards</div>
        </PanelGalleryLayout>
      </>,
    );

    const chrome = screen.getByText('Collection tabs').closest<HTMLElement>(
      '[data-panel-scroll-chrome]',
    );
    const scrollOwner = screen.getByText('Gallery cards').closest<HTMLElement>(
      '[data-panel-scroll-owner]',
    );
    expect(chrome).not.toBeNull();
    expect(scrollOwner).not.toBeNull();
    if (!chrome || !scrollOwner) throw new Error('Panel chrome and scroll owner must render.');
    expect(chrome.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(chrome.closest<HTMLElement>('[data-panel-layout-scroll-region]'))
      .toContainElement(scrollOwner);
  });

  it('keeps meta content outside the panel scroll owner while gallery children stay inside it', () => {
    renderInPanelLayout(
      <PanelGalleryLayout meta={<span>Session metadata</span>}>
        <div>Gallery cards</div>
      </PanelGalleryLayout>,
    );

    expect(screen.getByText('Session metadata').closest('[data-panel-scroll-owner]')).toBeNull();
    expect(screen.getByText('Gallery cards').closest('[data-panel-scroll-owner]')).not.toBeNull();
  });
});

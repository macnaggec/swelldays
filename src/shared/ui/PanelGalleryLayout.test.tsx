import { screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { PanelLayout } from './PanelLayout';
import { PanelGalleryLayout } from './PanelGalleryLayout';
import { PanelScrollChromeProvider } from './PanelScrollChrome';

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

  it('renders route-owned panel chrome inside the gallery scroll owner', () => {
    renderInPanelLayout(
      <PanelScrollChromeProvider value={<div>Collection tabs</div>}>
        <PanelGalleryLayout>
          <div>Gallery cards</div>
        </PanelGalleryLayout>
      </PanelScrollChromeProvider>,
    );

    expect(screen.getByText('Collection tabs').closest('[data-panel-gallery-scroller]')).not.toBeNull();
  });
});

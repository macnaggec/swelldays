import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { PanelLayout, PanelLayoutRail } from './PanelLayout';

describe('PanelLayoutRail', () => {
  it('pins rail content beside the scroller, outside the scroll owner', () => {
    render(
      <PanelLayout>
        <div>Scrolled content</div>
        <PanelLayoutRail>
          <nav>Date rail</nav>
        </PanelLayoutRail>
      </PanelLayout>,
    );

    const rail = screen.getByText('Date rail');
    expect(rail.closest('[data-panel-layout-rail]')).not.toBeNull();
    expect(rail.closest('[data-panel-scroll-owner]')).toBeNull();
    expect(screen.getByText('Scrolled content').closest('[data-panel-scroll-owner]')).not.toBeNull();
  });

  it('renders nothing when mounted outside a PanelLayout', () => {
    render(
      <PanelLayoutRail>
        <nav>Date rail</nav>
      </PanelLayoutRail>,
    );

    expect(screen.queryByText('Date rail')).toBeNull();
  });
});

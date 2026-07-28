import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { SidePanel } from './SidePanel';

describe('SidePanel bottom sheet', () => {
  it('reports the snap it was given and a new one when the prop changes', () => {
    const { rerender } = render(
      <SidePanel drawerPresentation="bottomSheet" sheetSnap="half" onSheetSnapChange={() => {}}>
        <div>Sheet body</div>
      </SidePanel>,
    );

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    expect(surface).toHaveAttribute('data-drawer-snap', 'half');

    rerender(
      <SidePanel drawerPresentation="bottomSheet" sheetSnap="full" onSheetSnapChange={() => {}}>
        <div>Sheet body</div>
      </SidePanel>,
    );

    expect(surface).toHaveAttribute('data-drawer-snap', 'full');
  });

  it('renders no expand/collapse button in the sheet even when onExpandToggle is passed', () => {
    render(
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap="half"
        onSheetSnapChange={() => {}}
        onExpandToggle={() => {}}
      >
        <div>Sheet body</div>
      </SidePanel>,
    );

    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();
  });

  it('renders the expand/collapse button for the same tree in the panel presentation', () => {
    render(
      <SidePanel onExpandToggle={() => {}}>
        <div>Panel body</div>
      </SidePanel>,
    );

    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument();
  });

  it('hides the pinned chrome on downward list scroll and reveals it on upward scroll at full', () => {
    render(
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap="full"
        onSheetSnapChange={() => {}}
        subheader={<div>Search and filters</div>}
      >
        <div style={{ height: '2000px' }}>Tall sheet content</div>
      </SidePanel>,
    );

    const scrollOwner = screen.getByText('Tall sheet content').closest('[data-panel-scroll-owner]');
    const stickyChrome = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    expect(scrollOwner).not.toBeNull();
    expect(stickyChrome).not.toBeNull();

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 24 } });
    expect(stickyChrome).toHaveAttribute('data-hidden', 'true');

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 8 } });
    expect(stickyChrome).not.toHaveAttribute('data-hidden');
  });
});

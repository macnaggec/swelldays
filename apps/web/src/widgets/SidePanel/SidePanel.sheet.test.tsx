import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import {
  BrowseSurfaceProvider,
  useBrowseSurface,
} from 'shared/ui/DrawerShell';
import { PanelLayoutFooter } from 'shared/ui/PanelLayout';
import { BrowseSectionBar } from 'widgets/BrowseSectionBar';
import { SidePanel } from './SidePanel';

function setScrollMetrics(
  element: HTMLElement,
  clientHeight: number,
  scrollHeight: number,
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
}

function BrowseSheetWithSectionBar() {
  const { snap, setSnap } = useBrowseSurface();

  return (
    <SidePanel
      drawerPresentation="bottomSheet"
      sheetSnap={snap}
      onSheetSnapChange={setSnap}
      bottomBar={(
        <BrowseSectionBar
          active="sessions"
          onMap={() => setSnap('peek')}
          onSectionChange={() => { }}
        />
      )}
    >
      <div style={{ height: '2000px' }}>Tall sheet content</div>
    </SidePanel>
  );
}

function renderBrowseSheetWithSectionBar() {
  return render(
    <AppShellLayoutPolicyProvider
      routeIntent="browse"
      browseExpanded
      galleryExpanded={false}
    >
      <BrowseSurfaceProvider
        preferredExpanded
        onPreferredExpandedChange={() => { }}
      >
        <BrowseSheetWithSectionBar />
      </BrowseSurfaceProvider>
    </AppShellLayoutPolicyProvider>,
  );
}

describe('SidePanel bottom sheet', () => {
  it('reports the snap it was given and a new one when the prop changes', () => {
    const { rerender } = render(
      <SidePanel drawerPresentation="bottomSheet" sheetSnap="half" onSheetSnapChange={() => { }}>
        <div>Sheet body</div>
      </SidePanel>,
    );

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    expect(surface).toHaveAttribute('data-drawer-snap', 'half');

    rerender(
      <SidePanel drawerPresentation="bottomSheet" sheetSnap="full" onSheetSnapChange={() => { }}>
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
        onSheetSnapChange={() => { }}
        onExpandToggle={() => { }}
      >
        <div>Sheet body</div>
      </SidePanel>,
    );

    expect(screen.queryByRole('button', { name: 'Expand panel' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Collapse panel' })).not.toBeInTheDocument();
  });

  it('does not reserve a header band when compact browse has no header controls', () => {
    render(
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap="half"
        onSheetSnapChange={() => { }}
      >
        <div>Sheet body</div>
      </SidePanel>,
    );

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    expect(surface.querySelector('[data-panel-layout-header]')).not.toBeInTheDocument();
  });

  it('renders the expand/collapse button for the same tree in the panel presentation', () => {
    render(
      <SidePanel onExpandToggle={() => { }}>
        <div>Panel body</div>
      </SidePanel>,
    );

    expect(screen.getByRole('button', { name: 'Expand panel' })).toBeInTheDocument();
  });

  it('marks pinned chrome as displaced from the sheet top until the list returns to its initial position', () => {
    render(
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap="full"
        onSheetSnapChange={() => { }}
        subheader={<div>Search and filters</div>}
      >
        <div style={{ height: '2000px' }}>Tall sheet content</div>
      </SidePanel>,
    );

    const scrollOwner = screen.getByText('Tall sheet content').closest<HTMLElement>(
      '[data-panel-scroll-owner]',
    );
    const stickyChrome = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    expect(scrollOwner).not.toBeNull();
    expect(stickyChrome).not.toBeNull();
    setScrollMetrics(scrollOwner!, 300, 900);
    expect(stickyChrome).not.toHaveAttribute('data-scrolled-from-top');

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 24 } });
    expect(stickyChrome).toHaveAttribute('data-hidden', 'true');
    expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 8 } });
    expect(stickyChrome).not.toHaveAttribute('data-hidden');
    expect(stickyChrome).toHaveAttribute('data-scrolled-from-top', 'true');

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 0 } });
    expect(stickyChrome).not.toHaveAttribute('data-scrolled-from-top');
  });

  it('restores pinned chrome and the list top when the sheet lowers from full to half', () => {
    const renderSheet = (sheetSnap: 'half' | 'full') => (
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap={sheetSnap}
        onSheetSnapChange={() => { }}
        subheader={<div>Search and filters</div>}
      >
        <div style={{ height: '2000px' }}>Tall sheet content</div>
      </SidePanel>
    );
    const { rerender } = render(renderSheet('full'));
    const scrollOwner = screen.getByText('Tall sheet content').closest<HTMLElement>(
      '[data-panel-scroll-owner]',
    );
    const stickyChrome = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    expect(scrollOwner).not.toBeNull();
    expect(stickyChrome).not.toBeNull();
    setScrollMetrics(scrollOwner!, 300, 900);

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 24 } });
    expect(stickyChrome).toHaveAttribute('data-hidden', 'true');

    rerender(renderSheet('half'));

    expect(scrollOwner).toHaveProperty('scrollTop', 0);
    expect(stickyChrome).not.toHaveAttribute('data-hidden');
  });

  it('keeps section navigation mounted while hiding labels on scroll down and restoring them on scroll up', () => {
    renderBrowseSheetWithSectionBar();

    const scrollOwner = screen.getByText('Tall sheet content').closest<HTMLElement>(
      '[data-panel-scroll-owner]',
    );
    expect(scrollOwner).not.toBeNull();
    setScrollMetrics(scrollOwner!, 300, 900);

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 24 } });

    expect(screen.getByRole('navigation', { name: 'Browse sections' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feed' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gallery' })).toBeInTheDocument();
    expect(screen.queryByText('Map')).not.toBeInTheDocument();
    expect(screen.queryByText('Feed')).not.toBeInTheDocument();
    expect(screen.queryByText('Gallery')).not.toBeInTheDocument();

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 8 } });

    expect(screen.getByText('Map')).toBeInTheDocument();
    expect(screen.getByText('Feed')).toBeInTheDocument();
    expect(screen.getByText('Gallery')).toBeInTheDocument();
  });

  it('restores search chrome after a previously scrolled side panel closes and reopens', () => {
    const renderPanel = (open: boolean) => (
      <SidePanel
        drawerPresentation="sideOverlay"
        open={open}
        subheader={<div>Search and upload</div>}
      >
        <div style={{ height: '2000px' }}>Tall panel content</div>
      </SidePanel>
    );
    const { rerender } = render(renderPanel(true));
    const scrollOwner = screen.getByText('Tall panel content').closest<HTMLElement>(
      '[data-panel-scroll-owner]',
    );
    const stickyChrome = screen.getByText('Search and upload').closest('[data-panel-scroll-chrome]');
    expect(scrollOwner).not.toBeNull();
    expect(stickyChrome).not.toBeNull();
    setScrollMetrics(scrollOwner!, 300, 900);

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 24 } });
    expect(stickyChrome).toHaveAttribute('data-hidden', 'true');

    rerender(renderPanel(false));
    rerender(renderPanel(true));

    expect(stickyChrome).not.toHaveAttribute('data-hidden');

    fireEvent.scroll(scrollOwner!, { target: { scrollTop: 23 } });

    expect(stickyChrome).not.toHaveAttribute('data-hidden');
  });

  it("marks the panel root that a floating footer mounts inside with the sheet's own snap, so PanelLayout's floating-footer CSS applies to it", () => {
    render(
      <SidePanel
        drawerPresentation="bottomSheet"
        sheetSnap="full"
        onSheetSnapChange={() => { }}
      >
        <div style={{ height: '2000px' }}>Tall sheet content</div>
        <PanelLayoutFooter>
          <button>Publish</button>
        </PanelLayoutFooter>
      </SidePanel>,
    );

    const panelRoot = screen.getByRole('button', { name: 'Publish' }).closest('[data-panel-layout]');
    expect(panelRoot).toHaveAttribute('data-sheet-snap', 'full');
  });
});

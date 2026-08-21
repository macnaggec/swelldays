import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { SidePanel } from './SidePanel';
import type { SheetSnap } from 'shared/ui/DrawerShell';
import { deriveAppShellLayoutPolicy, type AppShellLayoutPolicy } from 'shared/model/appShellLayoutPolicy';
import { usePanelExpansionStore } from 'shared/model/panelExpansionStore';

const preferences = Object.freeze({ browseExpanded: true, galleryExpanded: true });

function DraftField() {
  const [draft, setDraft] = useState('');

  return (
    <input
      aria-label="Draft note"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

// Mirrors the policy→props mapping in apps/web/src/app/routes/_panel.tsx.
function renderSidePanelForPolicy(policy: AppShellLayoutPolicy) {
  if (policy.drawer.presentation === 'hidden' || policy.drawer.presentation === 'bottomSheet') {
    throw new Error('a band crossing must keep the drawer mounted in its panel form');
  }

  return (
    <SidePanel
      drawerPresentation={policy.drawer.presentation}
      drawerModality={policy.drawer.modality === 'modal' ? 'modal' : 'nonmodal'}
      expanded={policy.drawer.state === 'expanded'}
    >
      <DraftField />
      <div style={{ height: 2000 }} />
    </SidePanel>
  );
}

// Mirrors the compact/regular browse sheet wiring in apps/web/src/app/routes/_panel.tsx: the sheet
// position is rendered state seeded once from the browsingExpanded preference, and landing
// on a snap is the only path that writes the preference back.
function BrowseSheetHarness() {
  const browsingExpanded = usePanelExpansionStore((state) => state.browsingExpanded);
  const setBrowsingExpanded = usePanelExpansionStore((state) => state.setBrowsingPanelExpanded);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>(() => (browsingExpanded ? 'full' : 'half'));

  const handleSnapChange = (snap: SheetSnap) => {
    setSheetSnap(snap);
    setBrowsingExpanded(snap === 'full');
  };

  return (
    <>
      <SidePanel
        drawerPresentation="bottomSheet"
        drawerModality="nonmodal"
        sheetSnap={sheetSnap}
        onSheetSnapChange={handleSnapChange}
        expanded={sheetSnap !== 'peek'}
      >
        <DraftField />
      </SidePanel>
      <button onClick={() => handleSnapChange('full')}>Land the sheet on full</button>
      <button onClick={() => handleSnapChange('half')}>Land the sheet on half</button>
      <button onClick={() => handleSnapChange('peek')}>Land the sheet on peek</button>
    </>
  );
}

describe('SidePanel band-transition continuity', () => {
  it('a wide→constrained routeWorkspace crossing preserves subtree, draft, focus, and scroll', () => {
    const wide = deriveAppShellLayoutPolicy({
      routeIntent: 'routeWorkspace', sizeBand: 'wide', heightBand: 'regular', preferences,
    });
    const constrained = deriveAppShellLayoutPolicy({
      routeIntent: 'routeWorkspace',
      sizeBand: 'constrained',
      heightBand: 'regular',
      preferences,
    });

    expect(wide.drawer.presentation).toBe('persistent');
    expect(constrained.drawer.presentation).toBe('sideOverlay');
    expect(wide.drawer.modality).toBe('nonmodal');
    expect(constrained.drawer.modality).toBe('modal');

    const { rerender } = render(renderSidePanelForPolicy(wide));

    const surface = screen.getByRole('complementary', { name: 'Content drawer' });
    const scroller = document.querySelector('[data-panel-scroll-owner]');
    if (!(scroller instanceof HTMLElement)) throw new Error('the panel scroll owner must be mounted');
    const draftInput = screen.getByLabelText('Draft note');

    fireEvent.change(draftInput, { target: { value: 'sunrise set at the point' } });
    draftInput.focus();
    scroller.scrollTop = 480;

    const before = usePanelExpansionStore.getState();

    rerender(renderSidePanelForPolicy(constrained));

    expect(screen.getByRole('dialog', { name: 'Content drawer' })).toBe(surface);
    expect(document.querySelector('[data-panel-scroll-owner]')).toBe(scroller);
    expect(scroller.scrollTop).toBe(480);
    expect(screen.getByLabelText('Draft note')).toHaveFocus();
    expect(screen.getByLabelText('Draft note')).toHaveValue('sunrise set at the point');

    rerender(renderSidePanelForPolicy(wide));

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toBe(surface);
    expect(screen.getByLabelText('Draft note')).toHaveValue('sunrise set at the point');

    const after = usePanelExpansionStore.getState();
    expect(after.browsingExpanded).toBe(before.browsingExpanded);
    expect(after.galleryExpanded).toBe(before.galleryExpanded);
  });

  it('a compact→constrained routeWorkspace crossing (rotating a phone) preserves subtree, draft, focus, and scroll', () => {
    // The realistic pairing for an actual device rotation: portrait is narrow and tall
    // (compact/regular), landscape is wide and short (constrained/short) — see
    // viewportCapabilities.ts's heightBand comment. Both cells are modal (isModal is
    // sizeBand !== 'wide'), so unlike the wide↔constrained crossing above, role stays
    // 'dialog' on both sides; what changes is the presentation mechanism underneath it
    // (fullScreen vs sideOverlay), which is exactly what this test exists to prove
    // doesn't discard anything.
    const compact = deriveAppShellLayoutPolicy({
      routeIntent: 'routeWorkspace', sizeBand: 'compact', heightBand: 'regular', preferences,
    });
    const constrained = deriveAppShellLayoutPolicy({
      routeIntent: 'routeWorkspace', sizeBand: 'constrained', heightBand: 'short', preferences,
    });

    expect(compact.drawer.presentation).toBe('fullScreen');
    expect(constrained.drawer.presentation).toBe('sideOverlay');
    expect(compact.drawer.modality).toBe('modal');
    expect(constrained.drawer.modality).toBe('modal');

    const { rerender } = render(renderSidePanelForPolicy(compact));

    const surface = screen.getByRole('dialog', { name: 'Content drawer' });
    const scroller = document.querySelector('[data-panel-scroll-owner]');
    if (!(scroller instanceof HTMLElement)) throw new Error('the panel scroll owner must be mounted');
    const draftInput = screen.getByLabelText('Draft note');

    fireEvent.change(draftInput, { target: { value: 'low tide at dawn' } });
    draftInput.focus();
    scroller.scrollTop = 320;

    rerender(renderSidePanelForPolicy(constrained));

    expect(screen.getByRole('dialog', { name: 'Content drawer' })).toBe(surface);
    expect(document.querySelector('[data-panel-scroll-owner]')).toBe(scroller);
    expect(scroller.scrollTop).toBe(320);
    expect(screen.getByLabelText('Draft note')).toHaveFocus();
    expect(screen.getByLabelText('Draft note')).toHaveValue('low tide at dawn');

    rerender(renderSidePanelForPolicy(compact));

    expect(screen.getByRole('dialog', { name: 'Content drawer' })).toBe(surface);
    expect(screen.getByLabelText('Draft note')).toHaveValue('low tide at dawn');
  });

  it('a wide→constrained browse crossing preserves the expansion preference and rendered expansion', () => {
    const wide = deriveAppShellLayoutPolicy({
      routeIntent: 'browse', sizeBand: 'wide', heightBand: 'regular', preferences,
    });
    const constrained = deriveAppShellLayoutPolicy({
      routeIntent: 'browse', sizeBand: 'constrained', heightBand: 'regular', preferences,
    });

    expect(wide.drawer.state).toBe('expanded');
    expect(constrained.drawer.state).toBe('expanded');

    const { rerender } = render(renderSidePanelForPolicy(wide));

    const draftInput = screen.getByLabelText('Draft note');
    const before = usePanelExpansionStore.getState();

    rerender(renderSidePanelForPolicy(constrained));

    expect(screen.getByLabelText('Draft note')).toBe(draftInput);

    const after = usePanelExpansionStore.getState();
    expect(after.browsingExpanded).toBe(before.browsingExpanded);
    expect(after.galleryExpanded).toBe(before.galleryExpanded);
  });
});

describe('the compact/regular browse cell', () => {
  beforeEach(() => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: true });
  });

  it('mounts the browse surface as a bottom sheet rather than a panel', () => {
    const compactBrowse = deriveAppShellLayoutPolicy({
      routeIntent: 'browse', sizeBand: 'compact', heightBand: 'regular', preferences,
    });
    expect(compactBrowse.drawer.presentation).toBe('bottomSheet');

    render(<BrowseSheetHarness />);

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toHaveAttribute(
      'data-drawer-presentation',
      'bottomSheet',
    );
  });

  it('opens at half when the stored browse preference is collapsed', () => {
    usePanelExpansionStore.setState({ browsingExpanded: false, galleryExpanded: true });

    render(<BrowseSheetHarness />);

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toHaveAttribute(
      'data-drawer-snap',
      'half',
    );
  });

  it('opens at full when the stored browse preference is expanded', () => {
    usePanelExpansionStore.setState({ browsingExpanded: true, galleryExpanded: true });

    render(<BrowseSheetHarness />);

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toHaveAttribute(
      'data-drawer-snap',
      'full',
    );
  });

  it('landing on full sets the stored browse preference to expanded', () => {
    render(<BrowseSheetHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Land the sheet on full' }));

    expect(usePanelExpansionStore.getState().browsingExpanded).toBe(true);
  });

  it.each(['half', 'peek'] as const)('landing on %s sets the stored browse preference to collapsed', (snap) => {
    usePanelExpansionStore.setState({ browsingExpanded: true, galleryExpanded: true });
    render(<BrowseSheetHarness />);

    fireEvent.click(screen.getByRole('button', { name: `Land the sheet on ${snap}` }));

    expect(usePanelExpansionStore.getState().browsingExpanded).toBe(false);
  });

  it('crossing back to wide after landing on full renders the expanded panel', () => {
    const { rerender } = render(<BrowseSheetHarness />);

    fireEvent.click(screen.getByRole('button', { name: 'Land the sheet on full' }));

    const wideAfterLanding = deriveAppShellLayoutPolicy({
      routeIntent: 'browse',
      sizeBand: 'wide',
      heightBand: 'regular',
      preferences: { browseExpanded: usePanelExpansionStore.getState().browsingExpanded, galleryExpanded: true },
    });
    expect(wideAfterLanding.drawer.state).toBe('expanded');

    rerender(renderSidePanelForPolicy(wideAfterLanding));

    expect(screen.getByRole('complementary', { name: 'Content drawer' })).toHaveAttribute(
      'data-drawer-state',
      'expanded',
    );
  });
});

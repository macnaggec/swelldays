import { fireEvent, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { SidePanel } from './SidePanel';
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

// Mirrors the policy→props mapping in src/app/routes/_panel.tsx.
function renderSidePanelForPolicy(policy: AppShellLayoutPolicy) {
  if (policy.drawer.presentation === 'hidden') {
    throw new Error('a band crossing must keep the drawer mounted');
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

describe('SidePanel band-transition continuity', () => {
  it('a wide→constrained routeWorkspace crossing preserves subtree, draft, focus, and scroll', () => {
    const wide = deriveAppShellLayoutPolicy({ routeIntent: 'routeWorkspace', sizeBand: 'wide', preferences });
    const constrained = deriveAppShellLayoutPolicy({
      routeIntent: 'routeWorkspace',
      sizeBand: 'constrained',
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

  it('a wide→constrained browse crossing preserves the expansion preference and rendered expansion', () => {
    const wide = deriveAppShellLayoutPolicy({ routeIntent: 'browse', sizeBand: 'wide', preferences });
    const constrained = deriveAppShellLayoutPolicy({ routeIntent: 'browse', sizeBand: 'constrained', preferences });

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

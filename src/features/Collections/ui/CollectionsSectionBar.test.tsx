import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { AppShellLayoutPolicyProvider } from 'shared/model/appShellPresentation';
import { publishDrawerGeometry } from 'shared/ui/DrawerShell/geometry';
import { CollectionsSectionBar } from './CollectionsSectionBar';

const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
}

function renderSwitcher() {
  return render(
    <AppShellLayoutPolicyProvider routeIntent="siteWorkspace" browseExpanded={false} galleryExpanded={false}>
      <CollectionsSectionBar activeTab="uploads" onTabChange={() => {}} />
    </AppShellLayoutPolicyProvider>,
  );
}

describe('CollectionsSectionBar', () => {
  afterEach(() => {
    setViewport(originalInnerWidth, originalInnerHeight);
    publishDrawerGeometry(null);
  });

  it('floats as its own pill, centered on the persistent drawer\'s own midpoint, at wide (leftStrip)', () => {
    setViewport(1280, 900);
    act(() => publishDrawerGeometry(new DOMRect(960, 0, 320, 900)));

    renderSwitcher();

    const nav = screen.getByRole('navigation', { name: 'Collections sections' });
    expect(nav).not.toHaveAttribute('data-avoid-drawer');
    expect(nav.style.getPropertyValue('--wa-collections-switcher-center-x')).toBe('1120px');
  });

  it('floats as its own pill, centered on the viewport (the fullScreen drawer\'s own midpoint), at portrait mobile (topBar)', () => {
    setViewport(375, 800);
    act(() => publishDrawerGeometry(new DOMRect(0, 0, 375, 800)));

    renderSwitcher();

    const nav = screen.getByRole('navigation', { name: 'Collections sections' });
    expect(nav).not.toHaveAttribute('data-avoid-drawer');
    expect(nav.style.getPropertyValue('--wa-collections-switcher-center-x')).toBe('187.5px');
  });

  it('docks into the account/cart rail instead of floating independently, only at landscape mobile (compactRail)', () => {
    setViewport(667, 375);
    act(() => publishDrawerGeometry(new DOMRect(60, 0, 300, 375)));

    renderSwitcher();

    const nav = screen.getByRole('navigation', { name: 'Collections sections' });
    expect(nav).toHaveAttribute('data-avoid-drawer');
    // No drawer-geometry centering — the rail's own flex layout places it, not this.
    expect(nav.style.getPropertyValue('--wa-collections-switcher-center-x')).toBe('');
  });
});

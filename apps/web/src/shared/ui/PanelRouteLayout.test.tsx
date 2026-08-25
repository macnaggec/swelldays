import { act, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { publishNavigationRailGeometry } from 'shared/model/navigationRailGeometry';
import { publishDrawerGeometry } from './DrawerShell/geometry';
import {
  FloatingPanelControls,
  PanelEmptyState,
  PanelRouteActionButton,
  PanelRouteLayout,
  PanelSearchToolbar,
} from './PanelRouteLayout';

describe('PanelRouteLayout', () => {
  afterEach(() => {
    act(() => {
      publishDrawerGeometry(null);
      publishNavigationRailGeometry(null);
    });
  });

  it('separates route header chrome from route content', () => {
    render(
      <PanelRouteLayout header={<div>Search control</div>}>
        <div>Route content</div>
      </PanelRouteLayout>,
    );

    expect(screen.getByText('Search control').closest('[data-panel-route-header]')).not.toBeNull();
    expect(screen.getByText('Route content').closest('[data-panel-route-layout]')).not.toBeNull();
  });

  it('renders a reusable empty state action', () => {
    const onAction = vi.fn();

    render(
      <PanelEmptyState
        title="No draft"
        description="Start a draft to continue."
        actionLabel="Start"
        pendingLabel="Starting..."
        onAction={onAction}
      />,
    );

    screen.getByRole('button', { name: 'Start' }).click();

    expect(screen.getByText('No draft').closest('[data-panel-empty-state]')).not.toBeNull();
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('separates search toolbar primary, action, and trailing controls', () => {
    render(
      <PanelSearchToolbar
        primary={<span>Search</span>}
        action={(
          <PanelRouteActionButton onClick={() => {}} showIndicator>
            Upload
          </PanelRouteActionButton>
        )}
        trailing={<span>Filters</span>}
        expanded
      />,
    );

    expect(screen.getByText('Search').closest('[data-panel-toolbar-primary]')).not.toBeNull();
    const action = screen.getByRole('button', { name: 'Upload' });

    expect(action.closest('[data-panel-toolbar-action]')).not.toBeNull();
    expect(action).toHaveAttribute('data-app-button-tone', 'neutral');
    expect(screen.getByText('Filters').closest('[data-panel-toolbar-trailing]')).not.toBeNull();
    expect(action.querySelector('[data-panel-route-action-indicator]')).not.toBeNull();
    expect(
      screen.getByText('Search').closest('[data-panel-search-toolbar]')?.hasAttribute('data-expanded'),
    ).toBe(true);
  });

  it('renders floating controls outside panel content flow', () => {
    render(
      <PanelRouteLayout>
        <FloatingPanelControls>
          <span>Compact filters</span>
        </FloatingPanelControls>
        <div>Panel body</div>
      </PanelRouteLayout>,
    );

    const controls = screen.getByText('Compact filters').closest('[data-floating-panel-controls]');

    expect(controls).not.toBeNull();
    expect(controls?.closest('[data-panel-route-header]')).toBeNull();
  });

  it('anchors floating controls beside the rendered drawer edge as its bounds change', () => {
    const publishDrawerWidth = (width: number) => {
      act(() => {
        publishDrawerGeometry(new DOMRect(window.innerWidth - width, 0, width, 768));
      });
    };

    publishDrawerWidth(320);
    render(
      <FloatingPanelControls>
        <span>Compact filters</span>
      </FloatingPanelControls>,
    );

    const controls = screen.getByText('Compact filters').closest<HTMLElement>(
      '[data-floating-panel-controls]',
    );

    expect(controls?.style.insetInlineEnd).toBe('328px');

    publishDrawerWidth(456);

    expect(controls?.style.insetInlineEnd).toBe('464px');
  });

  it('bounds floating controls between the measured nav rail and the drawer edge, for a narrow band to scroll within instead of wrapping', () => {
    const drawerWidth = 320;
    act(() => {
      publishNavigationRailGeometry(new DOMRect(12, 0, 96, 44));
      publishDrawerGeometry(new DOMRect(window.innerWidth - drawerWidth, 0, drawerWidth, 768));
    });

    render(
      <FloatingPanelControls>
        <span>Compact filters</span>
      </FloatingPanelControls>,
    );

    const controls = screen.getByText('Compact filters').closest<HTMLElement>(
      '[data-floating-panel-controls]',
    );

    // maxWidth = drawer.left - navRail.right - 2 * 8px gap
    const expectedMaxWidth = (window.innerWidth - drawerWidth) - 108 - 16;
    expect(controls?.style.maxWidth).toBe(`${expectedMaxWidth}px`);
  });
});

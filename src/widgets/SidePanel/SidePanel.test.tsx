import { readFileSync } from 'node:fs';
import { act, fireEvent, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render } from 'test/setup/render';
import { SidePanel } from './SidePanel';
import { PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';

const sidePanelCss = readFileSync('src/shared/ui/PanelLayout/PanelLayout.module.css', 'utf8');
const designTokensCss = readFileSync('src/shared/ui/design-system/tokens.css', 'utf8');

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

function cssRule(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sidePanelCss.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));

  return match?.[1]?.replace(/\s+/g, ' ').trim() ?? '';
}

function FocusRestoreHarness() {
  const [isOpen, setIsOpen] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button ref={triggerRef}>Drawer trigger</button>
      {isOpen && (
        <SidePanel restoreFocusRef={triggerRef}>
          <button onClick={() => setIsOpen(false)}>Close drawer</button>
        </SidePanel>
      )}
    </>
  );
}

describe('SidePanel', () => {
  it('renders panel content inside one labeled semantic drawer surface', () => {
    render(
      <SidePanel>
        <div>Panel body</div>
      </SidePanel>,
    );

    const drawer = screen.getByRole('complementary', { name: 'Content drawer' });
    expect(drawer).toContainElement(screen.getByText('Panel body'));
  });

  it('forwards onBack as the modal drawer\'s Escape handler', () => {
    const onBackSpy = vi.fn();

    render(
      <SidePanel drawerPresentation="fullScreen" drawerModality="modal" onBack={onBackSpy}>
        <div>Panel body</div>
      </SidePanel>,
    );

    const drawer = screen.getByRole('dialog', { name: 'Content drawer' });
    fireEvent.keyDown(drawer, { key: 'Escape' });

    expect(onBackSpy).toHaveBeenCalledOnce();
  });

  it('restores focus to the drawer trigger when the surface unmounts', () => {
    render(<FocusRestoreHarness />);
    const closeButton = screen.getByRole('button', { name: 'Close drawer' });
    closeButton.focus();

    fireEvent.click(closeButton);

    expect(screen.getByRole('button', { name: 'Drawer trigger' })).toHaveFocus();
  });

  it('renders a full-width route header without panel edge controls', () => {
    render(
      <SidePanel headerFullWidth header={<div>Cart header</div>}>
        <div>Panel body</div>
      </SidePanel>,
    );

    expect(screen.getByText('Cart header')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expand panel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /collapse panel/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /hide panel/i })).not.toBeInTheDocument();
  });

  it('gives browse content one declared scroll owner with sticky chrome inside it', () => {
    render(
      <SidePanel
        subheader={<div>Search and filters</div>}
      >
        <div>Session cards</div>
      </SidePanel>,
    );

    const drawer = screen.getByRole('complementary', { name: 'Content drawer' });
    const scrollOwners = drawer.querySelectorAll<HTMLElement>('[data-panel-scroll-owner]');
    const chrome = screen.getByText('Search and filters').closest<HTMLElement>(
      '[data-panel-scroll-chrome]',
    );

    expect(scrollOwners).toHaveLength(1);
    expect(scrollOwners[0]).toContainElement(chrome);
    setScrollMetrics(scrollOwners[0]!, 300, 900);

    fireEvent.scroll(scrollOwners[0]!, { target: { scrollTop: 80 } });
    expect(chrome).toHaveAttribute('data-hidden');

    fireEvent.scroll(scrollOwners[0]!, { target: { scrollTop: 20 } });
    expect(chrome).not.toHaveAttribute('data-hidden');
  });

  it('hides the full-width subheader when descendant panel content scrolls down and reveals it on scroll up', () => {
    render(
      <SidePanel
        subheader={<div>Search and filters</div>}
      >
        <div
          data-testid="media-list"
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Media cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const mediaList = screen.getByTestId('media-list');
    setScrollMetrics(mediaList, 300, 900);

    fireEvent.scroll(mediaList, { target: { scrollTop: 80 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(mediaList, { target: { scrollTop: 20 } });
    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('keeps search chrome visible while an isolated result list scrolls', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div
          data-testid="search-results"
          data-scroll-direction-isolated
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Spot results</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const searchResults = screen.getByTestId('search-results');

    fireEvent.scroll(searchResults, { target: { scrollTop: 80 } });

    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('keeps search chrome visible during a panel collection scroll correction', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div
          data-testid="collection-list"
          data-panel-collection-scroll-correction
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Collection cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const collectionList = screen.getByTestId('collection-list');
    setScrollMetrics(collectionList, 300, 900);

    fireEvent.scroll(collectionList, { target: { scrollTop: 80 } });

    expect(subheader).not.toHaveAttribute('data-hidden');

    collectionList.removeAttribute('data-panel-collection-scroll-correction');
    fireEvent.scroll(collectionList, { target: { scrollTop: 79 } });

    expect(subheader).not.toHaveAttribute('data-hidden');

    fireEvent.scroll(collectionList, { target: { scrollTop: 100 } });
    expect(subheader).toHaveAttribute('data-hidden');

    collectionList.setAttribute('data-panel-collection-scroll-correction', 'true');
    fireEvent.scroll(collectionList, { target: { scrollTop: 40 } });
    expect(subheader).toHaveAttribute('data-hidden');

    collectionList.removeAttribute('data-panel-collection-scroll-correction');
    fireEvent.scroll(collectionList, { target: { scrollTop: 39 } });

    expect(subheader).toHaveAttribute('data-hidden');
  });

  it('tracks user movement away from a settled panel collection correction', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div
          data-testid="collection-list"
          data-panel-collection-scroll-correction="80"
        >
          <div style={{ height: 480 }}>Collection cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const collectionList = screen.getByTestId('collection-list');
    setScrollMetrics(collectionList, 300, 900);

    fireEvent.scroll(collectionList, { target: { scrollTop: 80 } });
    expect(subheader).not.toHaveAttribute('data-hidden');

    fireEvent.scroll(collectionList, { target: { scrollTop: 100 } });

    expect(subheader).toHaveAttribute('data-hidden');
  });

  it('preserves hidden chrome when a different scroll target starts a correction', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div data-testid="feed-list">
          <div style={{ height: 480 }}>Feed cards</div>
        </div>
        <div
          data-testid="collection-list"
          data-panel-collection-scroll-correction
        >
          <div style={{ height: 480 }}>Collection cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const feedList = screen.getByTestId('feed-list');
    const collectionList = screen.getByTestId('collection-list');
    setScrollMetrics(feedList, 300, 900);
    setScrollMetrics(collectionList, 300, 900);

    fireEvent.scroll(feedList, { target: { scrollTop: 24 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(collectionList, { target: { scrollTop: 80 } });
    expect(subheader).toHaveAttribute('data-hidden');

    collectionList.removeAttribute('data-panel-collection-scroll-correction');
    fireEvent.scroll(collectionList, { target: { scrollTop: 79 } });

    expect(subheader).toHaveAttribute('data-hidden');
  });

  it('uses one chrome visibility state when alternating between scroll targets', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div data-testid="first-list">
          <div style={{ height: 480 }}>First cards</div>
        </div>
        <div data-testid="second-list">
          <div style={{ height: 480 }}>Second cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const firstList = screen.getByTestId('first-list');
    const secondList = screen.getByTestId('second-list');
    setScrollMetrics(firstList, 300, 900);
    setScrollMetrics(secondList, 300, 900);

    act(() => {
      firstList.scrollTop = 0;
      firstList.dispatchEvent(new Event('scroll'));
      secondList.scrollTop = 24;
      secondList.dispatchEvent(new Event('scroll'));
    });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(firstList, { target: { scrollTop: 1 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(secondList, { target: { scrollTop: 15 } });
    expect(subheader).not.toHaveAttribute('data-hidden');

    fireEvent.scroll(firstList, { target: { scrollTop: 2 } });
    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('ignores a tiny opposite correction before revealing the subheader on deliberate upward travel', () => {
    render(
      <SidePanel
        subheader={<div>Search and filters</div>}
      >
        <div
          data-testid="media-list"
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Media cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const mediaList = screen.getByTestId('media-list');
    setScrollMetrics(mediaList, 300, 900);

    fireEvent.scroll(mediaList, { target: { scrollTop: 24 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(mediaList, { target: { scrollTop: 23 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(mediaList, { target: { scrollTop: 15 } });
    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('keeps search chrome and one-card content stable when hiding the row would erase the scroll range', () => {
    render(
      <SidePanel
        drawerPresentation="sideOverlay"
        subheader={<div>Search and filters</div>}
      >
        <article>Only session card</article>
      </SidePanel>,
    );

    const drawer = screen.getByRole('complementary', { name: 'Content drawer' });
    const scrollOwner = drawer.querySelector<HTMLElement>('[data-panel-scroll-owner]');
    const chrome = screen.getByText('Search and filters').closest<HTMLElement>(
      '[data-panel-scroll-chrome]',
    );
    const card = screen.getByText('Only session card');
    expect(scrollOwner).not.toBeNull();
    expect(chrome).not.toBeNull();
    expect(scrollOwner).toContainElement(card);
    setScrollMetrics(scrollOwner!, 300, 321);
    Object.defineProperty(chrome!, 'offsetHeight', {
      configurable: true,
      value: 93,
    });

    for (const scrollTop of [21, 0, 21, 0]) {
      fireEvent.scroll(scrollOwner!, { target: { scrollTop } });

      expect(chrome).not.toHaveAttribute('data-hidden');
      expect(screen.getByText('Only session card')).toBe(card);
      expect(scrollOwner).toContainElement(card);
    }
  });

  it('keeps one chrome mount in the scroll owner when content declares its own overflow context', () => {
    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <div data-testid="feed" style={{ overflowX: 'hidden' }}>
          <div>Session cards</div>
        </div>
      </SidePanel>,
    );

    const chromeElements = document.querySelectorAll<HTMLElement>('[data-panel-scroll-chrome]');
    const drawer = screen.getByRole('complementary', { name: 'Content drawer' });
    const scrollOwner = drawer.querySelector<HTMLElement>('[data-panel-scroll-owner]');
    const feed = screen.getByTestId('feed');

    expect(chromeElements).toHaveLength(1);
    expect(scrollOwner).toContainElement(chromeElements[0]!);
    expect(feed).not.toContainElement(chromeElements[0]!);
  });

  it('keeps sticky search chrome transparent above scrolled content', () => {
    expect(cssRule('.stickyChrome')).not.toMatch(/(?:^|; )background:/);
    expect(cssRule('.stickyChrome[data-over-content]')).toBe('');
    expect(cssRule('.stickyChrome')).not.toContain('--wa-panel-control-background:');
    expect(cssRule('.stickyChrome')).not.toContain('--wa-panel-control-backdrop:');
    expect(designTokensCss).toContain('--wa-panel-control-background:');
    expect(designTokensCss).toContain('--wa-panel-control-backdrop:');
  });

  it('gives Mantine controls projected into any gallery chrome the shared control glass', () => {
    const rule = cssRule('.stickyChrome :global(.mantine-Tabs-list)');
    expect(sidePanelCss).toContain('.stickyChrome :global(.mantine-Input-input),');
    expect(rule).toContain('background: var(--wa-panel-control-background)');
    expect(rule).toContain('backdrop-filter: var(--wa-panel-control-backdrop)');
    expect(rule).toContain('border: 1px solid var(--wa-glass-border-media-overlay)');
  });

  it('freezes the hidden chrome state while a descendant menu is pinned open, then resumes on release', () => {
    function PinControl() {
      const { pinChromeHidden } = usePanelScrollChromeState();
      return (
        <>
          <button onClick={() => pinChromeHidden?.(true)}>Pin</button>
          <button onClick={() => pinChromeHidden?.(false)}>Unpin</button>
        </>
      );
    }

    render(
      <SidePanel subheader={<div>Search and filters</div>}>
        <PinControl />
        <div
          data-testid="media-list"
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Media cards</div>
        </div>
      </SidePanel>,
    );

    const subheader = screen.getByText('Search and filters').closest('[data-panel-scroll-chrome]');
    const mediaList = screen.getByTestId('media-list');
    setScrollMetrics(mediaList, 300, 900);

    fireEvent.scroll(mediaList, { target: { scrollTop: 80 } });
    expect(subheader).toHaveAttribute('data-hidden');

    // Pinned (an open date menu): scrolling back up must not reveal the
    // subheader out from under the menu's own trigger.
    fireEvent.click(screen.getByRole('button', { name: 'Pin' }));
    fireEvent.scroll(mediaList, { target: { scrollTop: 20 } });
    expect(subheader).toHaveAttribute('data-hidden');

    // Released: the scroll direction tracked underneath the whole time is
    // exposed immediately, with no extra scroll needed to "catch up".
    fireEvent.click(screen.getByRole('button', { name: 'Unpin' }));
    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('shares the same hidden state with descendant gallery chrome', () => {
    render(
      <SidePanel>
        <PanelLayoutStickyChrome>
          <div>Collection filters</div>
        </PanelLayoutStickyChrome>
        <div
          data-testid="collection-list"
          style={{ height: 120, overflowY: 'auto' }}
        >
          <div style={{ height: 480 }}>Collection cards</div>
        </div>
      </SidePanel>,
    );

    const toolbar = screen.getByText('Collection filters').closest('[data-panel-scroll-chrome]');
    const collectionList = screen.getByTestId('collection-list');
    setScrollMetrics(collectionList, 300, 900);

    fireEvent.scroll(collectionList, { target: { scrollTop: 80 } });
    expect(toolbar).toHaveAttribute('data-hidden');

    fireEvent.scroll(collectionList, { target: { scrollTop: 20 } });
    expect(toolbar).not.toHaveAttribute('data-hidden');
  });
});

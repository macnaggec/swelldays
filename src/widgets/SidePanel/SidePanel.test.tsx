import { readFileSync } from 'node:fs';
import { fireEvent, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'test/setup/render';
import { SidePanel } from './SidePanel';
import { PanelScrollChrome, PanelScrollChromeProvider } from 'shared/ui/PanelScrollChrome';

const sidePanelCss = readFileSync('src/shared/ui/PanelScrollChrome.module.css', 'utf8');
const designTokensCss = readFileSync('src/shared/ui/design-system/tokens.css', 'utf8');

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

    fireEvent.scroll(mediaList, { target: { scrollTop: 80 } });
    expect(subheader).toHaveAttribute('data-hidden');

    fireEvent.scroll(mediaList, { target: { scrollTop: 20 } });
    expect(subheader).not.toHaveAttribute('data-hidden');
  });

  it('does not reveal the subheader for a tiny opposite scroll correction during momentum', () => {
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

    fireEvent.scroll(mediaList, { target: { scrollTop: 80 } });
    fireEvent.scroll(mediaList, { target: { scrollTop: 79 } });

    expect(subheader).toHaveAttribute('data-hidden');
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
    expect(cssRule('.chrome')).not.toMatch(/(?:^|; )background:/);
    expect(cssRule('.chrome[data-over-content]')).toBe('');
    expect(cssRule('.chrome')).not.toContain('--wa-panel-control-background:');
    expect(cssRule('.chrome')).not.toContain('--wa-panel-control-backdrop:');
    expect(designTokensCss).toContain('--wa-panel-control-background:');
    expect(designTokensCss).toContain('--wa-panel-control-backdrop:');
  });

  it('gives Mantine controls projected into any gallery chrome the shared control glass', () => {
    const rule = cssRule('.chrome :global(.mantine-Tabs-list)');
    expect(sidePanelCss).toContain('.chrome :global(.mantine-Input-input),');
    expect(rule).toContain('background: var(--wa-panel-control-background)');
    expect(rule).toContain('backdrop-filter: var(--wa-panel-control-backdrop)');
    expect(rule).toContain('border: 1px solid var(--wa-glass-border-media-overlay)');
  });

  it('shares the same hidden state with descendant gallery chrome', () => {
    render(
      <SidePanel>
        <PanelScrollChromeProvider value={<div>Collection filters</div>}>
          <PanelScrollChrome />
        </PanelScrollChromeProvider>
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

    fireEvent.scroll(collectionList, { target: { scrollTop: 80 } });
    expect(toolbar).toHaveAttribute('data-hidden');

    fireEvent.scroll(collectionList, { target: { scrollTop: 20 } });
    expect(toolbar).not.toHaveAttribute('data-hidden');
  });
});

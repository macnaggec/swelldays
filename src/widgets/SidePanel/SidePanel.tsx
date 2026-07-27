import {
  useCallback,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';
import { IconChevronLeft, IconMaximize, IconMinimize } from '@tabler/icons-react';
import {
  DrawerShell,
  type DrawerShellModality,
  type DrawerShellPanelPresentation,
} from 'shared/ui/DrawerShell';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { PanelLayout, PanelChromeSlot, PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';
import styles from './SidePanel.module.css';

const SCROLL_DIRECTION_THRESHOLD_PX = 8;

interface ScrollPosition {
  anchor: number;
  hidden: boolean;
}

interface SidePanelProps {
  drawerPresentation?: DrawerShellPanelPresentation;
  drawerModality?: DrawerShellModality;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  /** Expands the panel to cover most of the viewport width. */
  expanded?: boolean;
  /** Called when the expand/collapse toggle is clicked. */
  onExpandToggle?: () => void;
  /** When provided, replaces the expand toggle with a ‹ back button. */
  onBack?: () => void;
  /** Visible label for the back button when the context needs more clarity. */
  backLabel?: string;
  /** Disables the visible back control without removing it from the title row. */
  backDisabled?: boolean;
  /** Center slot in the top bar (e.g. ModeSwitcher or search bar). */
  header?: ReactNode;
  /** Allows rich headers, such as cart controls, to span the full top row. */
  headerFullWidth?: boolean;
  /**
   * Pinned search/filter row for the panel. Mounted once into PanelLayout's
   * sticky-chrome slot inside the panel scroll owner, where it hides on scroll
   * down and reveals on scroll up.
   */
  subheader?: ReactNode;
  children?: ReactNode;
}

export function SidePanel({
  drawerPresentation = 'persistent',
  drawerModality = 'nonmodal',
  restoreFocusRef,
  expanded,
  onExpandToggle,
  onBack,
  backLabel,
  backDisabled,
  header,
  headerFullWidth,
  subheader,
  children,
}: SidePanelProps) {
  const scrollPositionByTargetRef = useRef<WeakMap<HTMLElement, ScrollPosition>>(new WeakMap());
  const [scrollChromeState, setScrollChromeState] = useState({ hidden: false });

  const handleBodyScrollCapture = useCallback((event: UIEvent<HTMLDivElement>) => {
    const scrollTarget = event.target;
    if (!(scrollTarget instanceof HTMLElement)) return;

    const currentScrollTop = scrollTarget.scrollTop;
    const position = scrollPositionByTargetRef.current.get(scrollTarget) ?? {
      anchor: 0,
      hidden: false,
    };

    if (currentScrollTop <= 0) {
      position.anchor = 0;
      position.hidden = false;
    } else if (position.hidden) {
      if (currentScrollTop > position.anchor) position.anchor = currentScrollTop;
      else if (position.anchor - currentScrollTop >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        position.hidden = false;
      }
    } else {
      if (currentScrollTop < position.anchor) position.anchor = currentScrollTop;
      else if (currentScrollTop - position.anchor >= SCROLL_DIRECTION_THRESHOLD_PX) {
        position.anchor = currentScrollTop;
        position.hidden = true;
      }
    }

    setScrollChromeState((current) => {
      return current.hidden === position.hidden ? current : { hidden: position.hidden };
    });
    scrollPositionByTargetRef.current.set(scrollTarget, position);
  }, []);

  return (
    <PanelScrollChromeStateProvider value={scrollChromeState}>
      <DrawerShell
        presentation={drawerPresentation}
        state={expanded ? 'expanded' : 'compact'}
        modality={drawerModality}
        restoreFocusRef={restoreFocusRef}
      >
        <PanelLayout
          onScrollCapture={handleBodyScrollCapture}
          header={(
            <div className={styles.panelTop}>
              {!headerFullWidth && (
                onBack || onExpandToggle ? (
                  <button
                    className={`${styles.topBtn} ${backLabel ? styles.topBtnLabeled : ''}`}
                    onClick={onBack ?? onExpandToggle}
                    disabled={backDisabled}
                    aria-label={onBack ? backLabel ?? 'Back' : expanded ? 'Collapse panel' : 'Expand panel'}
                  >
                    {onBack ? (
                      <>
                        <IconChevronLeft size={16} />
                        {backLabel && <span>{backLabel}</span>}
                      </>
                    ) : expanded ? (
                      <IconMinimize size={16} />
                    ) : (
                      <IconMaximize size={16} />
                    )}
                  </button>
                ) : (
                  <div aria-hidden="true" />
                )
              )}

              {header && (
                <PanelChromeSlot className={headerFullWidth ? styles.headerSlotFull : styles.headerSlot}>
                  {header}
                </PanelChromeSlot>
              )}
              {!headerFullWidth && <div aria-hidden="true" />}
            </div>
            )}
        >
          {subheader && <PanelLayoutStickyChrome>{subheader}</PanelLayoutStickyChrome>}
          {children}
        </PanelLayout>
      </DrawerShell>
    </PanelScrollChromeStateProvider>
  );
}

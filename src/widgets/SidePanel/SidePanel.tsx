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
  type DrawerShellPresentation,
  type SheetSnap,
} from 'shared/ui/DrawerShell';
import { PanelScrollChromeStateProvider } from 'shared/ui/PanelScrollChrome';
import { PanelLayout, PanelChromeSlot, PanelLayoutStickyChrome } from 'shared/ui/PanelLayout';
import styles from './SidePanel.module.css';

const SCROLL_DIRECTION_THRESHOLD_PX = 8;

function hasMeaningfulVerticalScrollTravel(scrollTarget: HTMLElement): boolean {
  return scrollTarget.scrollHeight - scrollTarget.clientHeight
    >= SCROLL_DIRECTION_THRESHOLD_PX;
}

interface ScrollPosition {
  anchor: number;
  hidden: boolean;
}

interface ScrollChromeState {
  hidden: boolean;
  sheetSnap: SheetSnap | undefined;
  open: boolean;
}

interface SidePanelProps {
  drawerPresentation?: DrawerShellPresentation;
  drawerModality?: DrawerShellModality;
  /** Keeps a side overlay mounted while removing it from view and interaction. */
  open?: boolean;
  /** Sheet position. Required when drawerPresentation is 'bottomSheet', ignored otherwise. */
  sheetSnap?: SheetSnap;
  /** Called when the sheet lands on a new snap. Required when drawerPresentation is 'bottomSheet'. */
  onSheetSnapChange?: (snap: SheetSnap) => void;
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
  /** Navigation rendered over the compact sheet, outside its moving surface. */
  bottomBar?: ReactNode;
  children?: ReactNode;
}

export function SidePanel({
  drawerPresentation = 'persistent',
  drawerModality = 'nonmodal',
  open = true,
  sheetSnap,
  onSheetSnapChange,
  restoreFocusRef,
  expanded,
  onExpandToggle,
  onBack,
  backLabel,
  backDisabled,
  header,
  headerFullWidth,
  subheader,
  bottomBar,
  children,
}: SidePanelProps) {
  const scrollPositionByTargetRef = useRef<WeakMap<HTMLElement, ScrollPosition>>(new WeakMap());
  const [scrollChromeState, setScrollChromeState] = useState<ScrollChromeState>({
    hidden: false,
    sheetSnap,
    open,
  });
  if (scrollChromeState.sheetSnap !== sheetSnap || scrollChromeState.open !== open) {
    setScrollChromeState({ hidden: false, sheetSnap, open });
  }

  const handleBodyScrollCapture = useCallback((event: UIEvent<HTMLDivElement>) => {
    if (!open) return;

    const scrollTarget = event.target;
    if (!(scrollTarget instanceof HTMLElement)) return;

    // Nested interactive scrollers own their own movement. Treating result-list
    // travel as panel travel hides the search control the user is operating.
    if (scrollTarget.closest('[data-scroll-direction-isolated]')) return;

    const currentScrollTop = scrollTarget.scrollTop;
    const position = scrollPositionByTargetRef.current.get(scrollTarget) ?? {
      anchor: 0,
      hidden: false,
    };

    if (!hasMeaningfulVerticalScrollTravel(scrollTarget)) {
      position.anchor = 0;
      position.hidden = false;
    } else if (currentScrollTop <= 0) {
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
      return current.hidden === position.hidden
        && current.sheetSnap === sheetSnap
        && current.open === open
        ? current
        : { hidden: position.hidden, sheetSnap, open };
    });
    scrollPositionByTargetRef.current.set(scrollTarget, position);
  }, [open, sheetSnap]);

  const showExpandToggle = Boolean(onExpandToggle)
    && drawerPresentation !== 'bottomSheet'
    && drawerPresentation !== 'sideOverlay';
  const hasPanelTop = Boolean(header || onBack || showExpandToggle);

  const panelLayout = (
    <PanelLayout
      onScrollCapture={handleBodyScrollCapture}
      header={hasPanelTop ? (
        <div className={styles.panelTop}>
          {!headerFullWidth && (
            onBack || showExpandToggle ? (
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
      ) : undefined}
    >
      {subheader && <PanelLayoutStickyChrome>{subheader}</PanelLayoutStickyChrome>}
      {children}
    </PanelLayout>
  );

  return (
    <PanelScrollChromeStateProvider value={{ ...scrollChromeState, drawerPresentation, sheetSnap }}>
      {drawerPresentation === 'bottomSheet' && sheetSnap !== undefined && onSheetSnapChange !== undefined ? (
        <DrawerShell
          presentation="bottomSheet"
          modality={drawerModality}
          restoreFocusRef={restoreFocusRef}
          snap={sheetSnap}
          onSnapChange={onSheetSnapChange}
        >
          {panelLayout}
        </DrawerShell>
      ) : drawerPresentation !== 'bottomSheet' ? (
        <DrawerShell
          presentation={drawerPresentation}
          state={expanded ? 'expanded' : 'compact'}
          open={open}
          modality={drawerModality}
          restoreFocusRef={restoreFocusRef}
        >
          {panelLayout}
        </DrawerShell>
      ) : null}
      {bottomBar}
    </PanelScrollChromeStateProvider>
  );
}

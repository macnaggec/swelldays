import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { materialClasses } from 'shared/ui/design-system';
import styles from './SectionSwitcher.module.css';

export interface SectionSwitcherItem {
  key: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  onIntent?: () => void;
}

interface SectionSwitcherProps extends ComponentPropsWithoutRef<'nav'> {
  items: SectionSwitcherItem[];
  /**
   * Overrides the scroll-driven label visibility entirely — e.g. a caller whose bar
   * doesn't live in the panel's own scrolling chrome (so that scroll state isn't
   * actually about it) needs label visibility that doesn't flicker with it. Omit to
   * keep the default: labels hide on scroll-down and reveal on scroll-up, matching
   * the panel chrome around it (BrowseSectionBar's own behavior).
   */
  labelsHidden?: boolean;
}

/**
 * A pill of icon+label buttons that switches between sibling sections (e.g.
 * Map/Feed/Gallery, or a collection's own tabs). Owns the pill's visual
 * styling and its label-hide-on-scroll behavior only; every other `<nav>`
 * prop (aria-label, positioning className, data attributes) passes straight
 * through, so each caller owns how and where its own bar is placed
 * (BrowseSectionBar floats it over the map; a panel footer just centers it).
 */
export function SectionSwitcher({ items, className, labelsHidden: labelsHiddenOverride, ...navProps }: SectionSwitcherProps) {
  const { hidden: scrollHidden } = usePanelScrollChromeState();
  const labelsHidden = labelsHiddenOverride ?? scrollHidden;

  return (
    <nav
      {...navProps}
      className={`${styles.root} ${materialClasses.chrome}${className ? ` ${className}` : ''}`}
      data-compact={labelsHidden || undefined}
    >
      {items.map((item) => (
        <button
          key={item.key}
          className={styles.item}
          type="button"
          aria-label={item.label}
          aria-current={item.active ? 'page' : undefined}
          onClick={item.onClick}
          onPointerEnter={item.onIntent}
          onPointerDown={item.onIntent}
          onTouchStart={item.onIntent}
          onFocus={item.onIntent}
        >
          {item.icon}
          {!labelsHidden && <span>{item.label}</span>}
        </button>
      ))}
    </nav>
  );
}

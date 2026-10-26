import React, { ReactNode, memo, useCallback } from 'react';
import { Stack } from '@mantine/core';
import styles from './BaseGallery.module.css';
import SelectionCheckbox from './SelectionCheckbox';
import { UseGallerySelectionReturn } from 'shared/hooks/gallery';
import { usePanelScrollChromeState } from 'shared/ui/PanelScrollChrome';
import { PanelCollectionGrid } from 'shared/ui/PanelCollectionGrid';

/**
 * Context passed to renderCard for each item
 */
export interface CardContext {
  /** Index of the item in the array */
  index: number;
  /** Whether this is the first item */
  isFirst: boolean;
  /** Whether this is the last item */
  isLast: boolean;
  /** Whether selection mode is active (hides individual card actions) */
  isSelectionMode: boolean;
  /** Native image loading priority derived from a virtual row's viewport overlap. */
  imageLoading?: 'eager' | 'lazy';
}

/** Props for the BaseGallery component */
export interface BaseGalleryProps<T extends { id: string }> {
  /** Array of items to display in the gallery */
  items: T[];

  /** Render function for each card - receives item and context */
  renderCard: (item: T, context: CardContext) => ReactNode;

  /** Optional function to extract unique ID from each item */
  getId?: (item: T) => string;

  /** Optional selection state from useGallerySelection hook */
  selection?: UseGallerySelectionReturn<T>;

  /** Optional toolbar content displayed above the gallery grid */
  toolbar?: ReactNode;

  /** Optional content displayed before the gallery grid (e.g., AddFileCard) */
  prepend?: ReactNode;

  /** Optional empty state displayed when items array is empty */
  emptyState?: ReactNode;

  /** Grid gap spacing (Mantine spacing value or CSS value) */
  gap?: string | number;

  /** Accessibility label for the gallery */
  'aria-label'?: string;

  /** Forwarded to PanelCollectionGrid — see its own doc comment. Defaults to true. */
  preservesScrollOnReflow?: boolean;
}

/**
 * Gallery - Generic slot-based grid component for displaying media items
 *
 * Renders items in a responsive CSS Grid masonry layout with slots for
 * toolbars, custom cards, and empty states. Foundation component for
 * feature-specific galleries (PublicGallery, UploadGallery, etc.).
 *
 * @example
 * ```tsx
 * const selection = useGallerySelection({ items, getId: (i) => i.id });
 *
 * <Gallery
 *   items={items}
 *   selection={selection}  // Gallery handles selection UI
 *   toolbar={<SelectionToolbar selection={selection} />}
 *   prepend={<AddFileCard onFilesSelected={handleFiles} />}
 *   renderCard={(item, context) => (
 *     <DraftCard mediaItem={item} />  // No selection props needed
 *   )}
 * />
 * ```
 */
function BaseGallery<T extends { id: string }>({
  items,
  renderCard,
  getId = (item: T) => item.id,
  selection,
  toolbar,
  prepend,
  emptyState,
  gap = 'md',
  'aria-label': ariaLabel = 'Gallery',
  preservesScrollOnReflow,
}: BaseGalleryProps<T>) {
  // Stable click handler to avoid creating new functions per item
  const handleItemClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const itemId = e.currentTarget.getAttribute('data-item-id');
      if (itemId && selection?.isSelectionMode) {
        selection.toggle(itemId);
      }
    },
    [selection]
  );

  const { hidden: panelChromeHidden } = usePanelScrollChromeState();

  return (
    <Stack gap={gap}>
      {/* Toolbar slot — sticky, hides on scroll down, reveals on scroll up */}
      {toolbar && (
        <div
          className={styles.toolbar}
          data-hidden={(panelChromeHidden && !selection?.isSelectionMode) || undefined}
        >
          {toolbar}
        </div>
      )}

      {/* Main gallery grid */}
      <PanelCollectionGrid
        className={styles.gallery}
        role="grid"
        aria-label={ariaLabel}
        preservesScrollOnReflow={preservesScrollOnReflow}
      >
        {/* Prepend slot - for special first items like AddFileCard */}
        {prepend && (
          <div className={styles['gallery-item']} role="gridcell">
            {prepend}
          </div>
        )}

        {items.map((item, index) => {
          const itemId = getId(item);
          const isSelected = selection?.isSelected(itemId) || false;
          const showCheckbox = selection?.isSelectionMode || false;

          return (
            <div
              key={itemId}
              className={styles['gallery-item']}
              role="gridcell"
              data-item-id={itemId}
              onClick={showCheckbox ? handleItemClick : undefined}
              data-selectable={showCheckbox}
            >
              <div className={styles.itemInner}>
                {renderCard(item, {
                  index,
                  isFirst: index === 0,
                  isLast: index === items.length - 1,
                  isSelectionMode: showCheckbox,
                })}

                {/* Selection checkbox overlay */}
                {showCheckbox && (
                  <SelectionCheckbox checked={isSelected} />
                )}
              </div>
            </div>
          );
        })}
      </PanelCollectionGrid>

      {/* Empty state slot - shown when no items */}
      {items.length === 0 && emptyState}
    </Stack>
  );
}

export default memo(BaseGallery) as typeof BaseGallery;

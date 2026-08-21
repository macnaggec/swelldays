

import React, { ReactNode, memo } from 'react';
import { Button, Group, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { UseGallerySelectionReturn } from 'shared/hooks/gallery';
import materials from 'shared/ui/design-system/materials.module.css';
import classes from './SelectionToolbar.module.css';

export interface SelectionToolbarProps<T> {
  selection: UseGallerySelectionReturn<T>;
  renderActions?: (selectedItems: T[]) => ReactNode;
  hasActions?: (selectedItems: T[]) => boolean;
  renderContent?: () => ReactNode;
}

const SelectionToolbar = memo(<T,>({
  selection,
  renderActions,
  hasActions,
  renderContent,
}: SelectionToolbarProps<T>) => {
  return (
    <Group justify="space-between">
      {/* Left: bulk actions (selection mode) + metadata content */}
      <Group gap="xs">
        {selection.isSelectionMode && renderActions && hasActions?.(selection.selectedItems) !== false && (
          <Menu position="bottom-start" withArrow>
            <Menu.Target>
              <Button
                variant="transparent"
                size="xs"
                leftSection={<IconDots size={14} />}
                disabled={!selection.hasSelection}
                className={`${classes.glassButton} ${materials.panelControl}`}
                radius="xl"
              >
                Actions
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {renderActions(selection.selectedItems)}
            </Menu.Dropdown>
          </Menu>
        )}
        {renderContent?.()}
      </Group>

      {/* Right: select-all + select/done toggle */}
      <Group gap="xs">
        {selection.isSelectionMode && (
          <Button
            variant="transparent"
            size="xs"
            className={classes.ghostButton}
            radius="xl"
            onClick={selection.isAllSelected ? selection.clearSelection : selection.selectAll}
          >
            {selection.isAllSelected ? 'Deselect all' : 'Select all'}
          </Button>
        )}
        <Button
          variant="transparent"
          size="xs"
          className={selection.isSelectionMode ? classes.ghostButton : `${classes.glassButton} ${materials.panelControl}`}
          radius="xl"
          onClick={selection.isSelectionMode ? selection.disableSelectionMode : selection.enableSelectionMode}
        >
          {selection.isSelectionMode ? 'Done' : 'Select'}
        </Button>
      </Group>
    </Group>
  );
}) as <T>(props: SelectionToolbarProps<T>) => React.ReactElement;

(SelectionToolbar as React.MemoExoticComponent<React.FC>).displayName = 'SelectionToolbar';
export default SelectionToolbar;

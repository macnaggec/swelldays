

import React, { ReactNode, memo } from 'react';
import { Group, Menu } from '@mantine/core';
import { IconDots } from '@tabler/icons-react';
import { UseGallerySelectionReturn } from 'shared/hooks/gallery';
import { AppButton } from 'shared/ui/AppButton';

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
              <AppButton
                leftSection={<IconDots size={14} />}
                disabled={!selection.hasSelection}
              >
                Actions
              </AppButton>
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
          <AppButton
            onClick={selection.isAllSelected ? selection.clearSelection : selection.selectAll}
          >
            {selection.isAllSelected ? 'Deselect all' : 'Select all'}
          </AppButton>
        )}
        <AppButton
          tone={selection.isSelectionMode ? 'neutral' : 'highlight'}
          onClick={selection.isSelectionMode ? selection.disableSelectionMode : selection.enableSelectionMode}
        >
          {selection.isSelectionMode ? 'Done' : 'Select'}
        </AppButton>
      </Group>
    </Group>
  );
}) as <T>(props: SelectionToolbarProps<T>) => React.ReactElement;

(SelectionToolbar as React.MemoExoticComponent<React.FC>).displayName = 'SelectionToolbar';
export default SelectionToolbar;

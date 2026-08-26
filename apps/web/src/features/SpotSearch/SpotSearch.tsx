import {
  CloseButton,
  Combobox,
  Divider,
  Group,
  Input,
  Loader,
  ScrollArea,
  useCombobox,
  type ComboboxProps,
} from '@mantine/core';
import classes from './SpotSearch.module.css';
import { IconSearch, IconMapPin } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { notifications } from '@mantine/notifications';
import { useState, useCallback, useDeferredValue, useMemo } from 'react';
import { useSpots, Spot } from 'entities/Spot';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { useViewportMetrics } from 'shared/model/viewportMetrics';
import { SpotResultOption } from './ui/SpotResultOption';

const RESULT_LIST_AVAILABLE_HEIGHT_PROPERTY = '--wa-spot-search-available-height';
const RESULT_LIST_MAX_HEIGHT_PROPERTY = '--wa-spot-search-results-max-height';
const RESULT_LIST_VIEWPORT_GAP_PX = 8;

const resultListViewportProps: React.HTMLAttributes<HTMLDivElement> & {
  'data-scroll-direction-isolated': boolean;
} = {
  'data-scroll-direction-isolated': true,
};

export interface SpotSearchProps {
  onSpotSelect: (spot: Spot) => void;
  /** Render prop: called with the current search term when no results are found. Caller owns all domain logic. */
  emptyAction?: (search: string) => ReactNode;
  placeholder?: string;
  /** Called when the active spot filter is cleared (✕ click or typing after a selection). */
  onClear?: () => void;
  /** When set, drives the search input and filtering state as if the spot had been selected via search. */
  activeSpot?: Pick<Spot, 'id' | 'name' | 'location'> | null;
  autoFocus?: boolean;
}

export default function SpotSearch({
  onSpotSelect,
  emptyAction,
  placeholder = "Search for a spot...",
  onClear,
  activeSpot,
  autoFocus,
}: SpotSearchProps) {
  const [search, setSearch] = useState('');
  const { safeAreaTopPx, safeAreaBottomPx } = useViewportMetrics();

  const isFiltering = activeSpot != null;
  const inputValue = activeSpot ? activeSpot.name : search;

  const combobox = useCombobox();
  const dropdownMiddlewares = useMemo<NonNullable<ComboboxProps['middlewares']>>(() => {
    const viewportPadding = {
      top: safeAreaTopPx + RESULT_LIST_VIEWPORT_GAP_PX,
      right: RESULT_LIST_VIEWPORT_GAP_PX,
      bottom: safeAreaBottomPx + RESULT_LIST_VIEWPORT_GAP_PX,
      left: RESULT_LIST_VIEWPORT_GAP_PX,
    };

    return {
      shift: { padding: viewportPadding },
      flip: { padding: viewportPadding },
      size: {
        padding: viewportPadding,
        apply: ({ availableHeight, elements }) => {
          elements.floating.style.setProperty(
            RESULT_LIST_AVAILABLE_HEIGHT_PROPERTY,
            `${Math.max(0, availableHeight)}px`,
          );
          elements.floating.style.setProperty(
            RESULT_LIST_MAX_HEIGHT_PROPERTY,
            `min(22rem, max(0px, calc(${Math.max(0, availableHeight)}px - var(--combobox-padding, 0.25rem) - var(--combobox-padding, 0.25rem) - 2px)))`,
          );
        },
      },
    };
  }, [safeAreaBottomPx, safeAreaTopPx]);

  // useDeferredValue defers the query key update so typing feels instant
  // while the fetch happens in the background — no manual debounce needed.
  const deferredSearch = useDeferredValue(search);
  const isQueryEnabled = deferredSearch.length >= 2;

  const { data: spots = null, isFetching } = useSpots(deferredSearch, { enabled: isQueryEnabled });

  const handleAliasError = useCallback((error: unknown) => {
    notifications.show({
      title: 'Failed to save alias',
      message: getErrorMessage(error) || 'Unable to save alias. Please try again.',
      color: 'red',
    });
  }, []);

  const handleSelect = useCallback((spotId: string) => {
    const spot = (spots ?? []).find(s => s.id === spotId);
    if (spot) {
      onSpotSelect(spot);
      combobox.closeDropdown();
    }
  }, [spots, onSpotSelect, combobox]);

  const handleClear = useCallback(() => {
    setSearch('');
    combobox.closeDropdown();
  }, [combobox]);

  const handleChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    // Only clear the active spot when the user actually edits away from it.
    // Guards against synthetic change events fired by closeDropdown() which
    // carry the stale local `search` value while activeSpot is already set.
    if (activeSpot && value !== activeSpot.name) {
      onClear?.();
    }
    setSearch(value);
    if (value.length >= 2) {
      combobox.openDropdown();
    } else {
      combobox.closeDropdown();
    }
  }, [activeSpot, onClear, combobox]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && search.length >= 2) {
      event.preventDefault();
      combobox.openDropdown();
    }
  }, [search, combobox]);

  const handleClearClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    handleClear();
    onClear?.();
  }, [handleClear, onClear]);

  const hasFetched = isQueryEnabled && spots !== null;
  const options = (spots ?? []).map((spot) => (
    <SpotResultOption key={spot.id} spot={spot} onAliasError={handleAliasError} />
  ));

  const renderRightSection = () => {
    if (isFetching) return <Loader size={16} />;
    if (inputValue) return <CloseButton size="sm" onClick={handleClearClick} aria-label="Clear search" className={classes.clearButton} />;
    return null;
  };

  const renderDropdownContent = () => {
    if (options.length > 0) return options;
    if (search.length < 2) return <Combobox.Empty>Type at least 2 characters</Combobox.Empty>;
    if (!hasFetched) return <Combobox.Empty>No spots found</Combobox.Empty>;
    return (
      <div>
        <Combobox.Empty>No spots found for "{search}"</Combobox.Empty>
        {emptyAction && (
          <>
            <Divider />
            <Group p="xs" justify="center">
              {emptyAction(search)}
            </Group>
          </>
        )}
      </div>
    );
  };

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={handleSelect}
      withinPortal
      floatingStrategy="fixed"
      hideDetached={false}
      middlewares={dropdownMiddlewares}
    >
      <Combobox.Target>
        <Input
          placeholder={placeholder}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          leftSection={
            isFiltering
              ? <IconMapPin size={16} className={classes.activeIcon} />
              : <IconSearch size={16} />
          }
          rightSection={renderRightSection()}
          rightSectionPointerEvents="auto"
          classNames={{ input: isFiltering ? `${classes.input} ${classes.filteringInput}` : classes.input }}
        />
      </Combobox.Target>

      <Combobox.Dropdown className={classes.dropdown}>
        <Combobox.Options>
          <ScrollArea.Autosize
            style={{
              maxHeight: `var(${RESULT_LIST_MAX_HEIGHT_PROPERTY}, 22rem)`,
            }}
            type="scroll"
            scrollbarSize="var(--combobox-padding)"
            offsetScrollbars="y"
            viewportProps={resultListViewportProps}
          >
            {renderDropdownContent()}
          </ScrollArea.Autosize>
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}

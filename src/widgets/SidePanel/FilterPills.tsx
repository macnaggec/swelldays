import { useState } from 'react';
import { Popover } from '@mantine/core';
import { DatePicker } from '@mantine/dates';
import { IconCalendar, IconHeart } from '@tabler/icons-react';
import type { BrowseDateFilter } from 'shared/model/browseFilters';
import styles from './FilterPills.module.css';

const pillStyle: React.CSSProperties = {
  background: 'var(--wa-panel-control-background, var(--wa-control-fill))',
  backdropFilter: 'var(--wa-panel-control-backdrop, blur(10px))',
  WebkitBackdropFilter: 'var(--wa-panel-control-backdrop, blur(10px))',
  border: '1px solid var(--wa-glass-border-media-overlay)',
  borderRadius: 20,
  color: 'rgba(255,255,255,0.82)',
  fontSize: 'var(--wa-font-size-xs)',
  fontWeight: 500,
  padding: '5px 13px',
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'flex',
  alignItems: 'center',
  gap: 5,
  flexShrink: 0,
};

const pillActiveStyle: React.CSSProperties = {
  // Selected = the app's selection accent as an opaque fill: readable over any media, unlike
  // the glass fill it replaces. Opaque also needs no backdrop blur (no re-blend of the stack
  // behind it every frame), so the blur inherited from pillStyle is switched off.
  background: 'var(--wa-control-fill-selected)',
  backdropFilter: 'none',
  WebkitBackdropFilter: 'none',
  border: '1px solid var(--wa-control-fill-selected)',
  color: 'var(--wa-text-on-accent)',
};

interface FilterPillsProps {
  active: BrowseDateFilter;
  onChange: (filter: BrowseDateFilter) => void;
  favoritesOnly?: boolean;
  onFavoritesChange?: (favoritesOnly: boolean) => void;
  horizontalScroll?: boolean;
}

export function FilterPills({
  active,
  onChange,
  favoritesOnly = false,
  onFavoritesChange,
  horizontalScroll = false,
}: FilterPillsProps) {
  const [open, setOpen] = useState(false);
  const isCustom = active !== null && typeof active === 'object';
  const customLabel = isCustom
    ? (active as { date: Date }).date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  function renderPill(label: string, key: Exclude<BrowseDateFilter, null | { date: Date }>) {
    const isActive = active === key;
    return (
      <button
        aria-pressed={isActive}
        style={{ ...pillStyle, ...(isActive ? pillActiveStyle : {}) }}
        onClick={() => onChange(isActive ? null : key)}
      >
        {label}
      </button>
    );
  }

  return (
    <div
      className={styles.root}
      data-horizontal-scroll={horizontalScroll || undefined}
    >
      {renderPill('Today', 'today')}
      {renderPill('Yesterday', 'yesterday')}
      {renderPill('Last 7 Days', 'last7')}
      <Popover opened={open} onChange={setOpen} position="bottom-start" shadow="md">
        <Popover.Target>
          <button
            aria-pressed={isCustom}
            style={{ ...pillStyle, ...(isCustom ? pillActiveStyle : {}) }}
            onClick={() => isCustom ? onChange(null) : setOpen((isOpen) => !isOpen)}
          >
            {customLabel ?? 'Date'}
            <IconCalendar size={12} />
          </button>
        </Popover.Target>
        <Popover.Dropdown p="xs">
          <DatePicker
            maxDate={new Date()}
            value={isCustom ? (active as { date: Date }).date : null}
            onChange={(d) => {
              setOpen(false);
              if (!d) { onChange(null); return; }
              onChange({ date: typeof d === 'string' ? new Date(d) : d });
            }}
          />
        </Popover.Dropdown>
      </Popover>
      {onFavoritesChange && (
        <button
          aria-pressed={favoritesOnly}
          style={{ ...pillStyle, ...(favoritesOnly ? pillActiveStyle : {}) }}
          onClick={() => onFavoritesChange(!favoritesOnly)}
        >
          <IconHeart size={12} fill={favoritesOnly ? 'currentColor' : 'none'} aria-hidden="true" />
          Favorites
        </button>
      )}
    </div>
  );
}

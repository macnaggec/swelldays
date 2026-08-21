import styles from './CollectionsScopeSwitcher.module.css';

export type CollectionsScope = 'uploads' | 'purchases' | 'favorites';

interface CollectionsScopeSwitcherProps {
  scope: CollectionsScope;
  onChange: (scope: CollectionsScope) => void;
}

const SEGMENTS: { key: CollectionsScope; label: string }[] = [
  { key: 'uploads', label: 'Uploads' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'favorites', label: 'Favorites' },
];

export function CollectionsScopeSwitcher({ scope, onChange }: CollectionsScopeSwitcherProps) {
  return (
    <div className={styles.root} role="group" aria-label="Collections sections">
      {SEGMENTS.map(({ key, label }) => (
        <button
          key={key}
          className={`${styles.segment} ${scope === key ? styles.segmentActive : ''}`}
          aria-pressed={scope === key}
          onClick={scope === key ? undefined : () => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

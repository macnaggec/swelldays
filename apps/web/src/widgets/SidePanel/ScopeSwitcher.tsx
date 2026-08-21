import styles from './ScopeSwitcher.module.css';

interface ScopeSwitcherProps {
  scope: 'sessions' | 'gallery';
  onChange: (scope: 'sessions' | 'gallery') => void;
}

export function ScopeSwitcher({ scope, onChange }: ScopeSwitcherProps) {
  return (
    <div className={styles.root} role="group" aria-label="Content scope">
      <button
        className={`${styles.segment} ${scope === 'sessions' ? styles.segmentActive : ''}`}
        aria-pressed={scope === 'sessions'}
        onClick={scope === 'sessions' ? undefined : () => onChange('sessions')}
      >
        Feed
      </button>
      <button
        className={`${styles.segment} ${scope === 'gallery' ? styles.segmentActive : ''}`}
        aria-pressed={scope === 'gallery'}
        onClick={scope === 'gallery' ? undefined : () => onChange('gallery')}
      >
        Gallery
      </button>
    </div>
  );
}

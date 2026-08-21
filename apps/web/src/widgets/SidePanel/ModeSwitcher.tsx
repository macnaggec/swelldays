import styles from './ModeSwitcher.module.css';

interface ModeSwitcherProps {
  uploadMode: boolean;
  onToggle: () => void;
}

export function ModeSwitcher({ uploadMode, onToggle }: ModeSwitcherProps) {
  return (
    <div className={styles.root} role="group" aria-label="Panel mode">
      <button
        className={`${styles.segment} ${!uploadMode ? styles.segmentActive : ''}`}
        aria-pressed={!uploadMode}
        onClick={uploadMode ? onToggle : undefined}
      >
        Browse
      </button>
      <button
        className={`${styles.segment} ${uploadMode ? styles.segmentActive : ''}`}
        aria-pressed={uploadMode}
        onClick={uploadMode ? undefined : onToggle}
      >
        Upload
      </button>
    </div>
  );
}

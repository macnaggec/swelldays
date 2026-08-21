import styles from './GalleryEmptyState.module.css';

interface GalleryEmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function GalleryEmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: GalleryEmptyStateProps) {
  return (
    <section className={styles.root} aria-labelledby="gallery-empty-title">
      <div className={styles.content}>
        <div className={styles.artwork} aria-hidden="true">
          <svg viewBox="0 0 96 72" focusable="false">
            <rect x="8" y="8" width="80" height="56" rx="13" />
            <circle cx="68" cy="25" r="5" />
            <path d="M18 48c8-8 15-8 23 0s15 8 23 0 15-8 19-3" />
            <path d="M18 55c8-6 15-6 23 0s15 6 23 0 15-6 19-2" />
          </svg>
        </div>

        <h2 id="gallery-empty-title" className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>

        {actionLabel && onAction && (
          <button type="button" className={styles.action} onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
    </section>
  );
}

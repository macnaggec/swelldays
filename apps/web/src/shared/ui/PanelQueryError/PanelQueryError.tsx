import { AppButton } from 'shared/ui/AppButton';
import styles from './PanelQueryError.module.css';

interface PanelQueryErrorProps {
  title: string;
  description: string;
  onRetry: () => void;
}

export function PanelQueryError({ title, description, onRetry }: PanelQueryErrorProps) {
  return (
    <section className={styles.root} aria-labelledby="panel-query-error-title">
      <div className={styles.content}>
        <div className={styles.artwork} aria-hidden="true">
          <svg viewBox="0 0 64 64" focusable="false">
            <circle cx="32" cy="32" r="26" />
            <line x1="32" y1="20" x2="32" y2="36" />
            <circle cx="32" cy="46" r="1.5" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <h2 id="panel-query-error-title" className={styles.title}>{title}</h2>
        <p className={styles.description}>{description}</p>

        <AppButton tone="highlight" onClick={onRetry} className={styles.action}>Retry</AppButton>
      </div>
    </section>
  );
}

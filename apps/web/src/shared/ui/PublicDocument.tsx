import { type PublicDocument as PublicDocumentModel } from '@swelldays/contracts/core';
import styles from './PublicDocument.module.css';

/** Same visible content model as the initial API document; replaced within one root. */
export function PublicDocument({ document }: { document: PublicDocumentModel }) {
  return (
    <article className={styles.root}>
      <h1>{document.heading}</h1>
      <p>{document.intro}</p>
      {document.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          <p>{section.text}</p>
        </section>
      ))}
      {document.links.length > 0 && (
        <p>{document.links.map((link) => <a key={link.href} href={link.href}>{link.label}</a>)}</p>
      )}

    </article>
  );
}

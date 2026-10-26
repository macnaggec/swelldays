import type { MouseEventHandler } from 'react';
import swelldaysLogoUrl from '../../../assets/startup/swelldays-logo-white.png';
import { FIRST_VISIT_CONTENT as content } from '@swelldays/contracts/core';

interface FirstVisitDocumentProps {
  onEnter?: MouseEventHandler<HTMLAnchorElement>;
  resumed?: boolean;
}

/** The public document stays readable independently of auth and map readiness. */
export function FirstVisitDocument({ onEnter, resumed = false }: FirstVisitDocumentProps) {
  return (
    <div data-first-visit-document data-first-visit-resumed={resumed || undefined}>
      <section data-first-visit-part="hero" id="intro" aria-labelledby="first-visit-title">
        <div data-first-visit-part="artwork" aria-hidden="true">
          <div data-first-visit-part="plate" />
          <div data-first-visit-part="plateTrailing" />
        </div>
        <div data-first-visit-part="veil" aria-hidden="true" />
        <div data-first-visit-part="logo">
          <span data-first-visit-part="rise"><img data-first-visit-part="logoImage" src={swelldaysLogoUrl} alt="Swelldays" width={600} height={272} /></span>
        </div>
        <div data-first-visit-part="content">
          <div data-first-visit-part="message">
            <h1 tabIndex={-1} id="first-visit-title" data-first-visit-part="title"><span data-first-visit-part="rise">{content.hero.heading}</span></h1>
            <div data-first-visit-paths>
              {content.paths.map((path) => (
                <section data-first-visit-path={path.id} id={path.id === 'surfer' ? 'map' : path.id} key={path.id} aria-labelledby={`first-visit-${path.id}`}>
                  <p data-first-visit-audience>{path.audience}</p>
                  <h2 id={`first-visit-${path.id}`}>{path.heading}</h2>
                  <p data-first-visit-description>{path.intro}</p>
                  <a data-first-visit-action href={path.action.href} onClick={path.id === 'surfer' ? onEnter : undefined}>{path.action.label}</a>
                </section>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

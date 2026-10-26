import { FIRST_VISIT_CONTENT as content } from '@swelldays/contracts/core';
import { escapeHtml as e, injectInitialBody } from './publicDocumentHtml';

export function injectFirstVisitHtml(shell: string): string {
  const bootstrap = /<div\b[^>]*\bdata-bootstrap-shell\b[^>]*>[\s\S]*?<\/div>/.exec(shell)?.[0]
    ?? '<div data-bootstrap-shell aria-hidden="true"></div>';
  // Keep the painted welcome outside the root React replaces. Moving it later
  // disconnects animated descendants and can restart their entrance animations.
  const withLoader = injectInitialBody(shell, `<div data-first-visit-loader aria-hidden="true">${bootstrap}</div>`);
  return withLoader.replace('<div id="root">', `<div data-first-visit-initial data-first-visit-preserved>${firstVisitHtml()}</div><div id="root">`);
}

export function firstVisitHtml(): string {
  const paths = content.paths.map((path) => `<section data-first-visit-path="${e(path.id)}" id="${path.id === 'surfer' ? 'map' : e(path.id)}" aria-labelledby="first-visit-${e(path.id)}"><p data-first-visit-audience>${e(path.audience)}</p><h2 id="first-visit-${e(path.id)}">${e(path.heading)}</h2><p data-first-visit-description>${e(path.intro)}</p><a data-first-visit-action href="${e(path.action.href)}">${e(path.action.label)}</a>${path.id === 'surfer' ? `<noscript><p>${e(content.noScript)}</p></noscript>` : ''}</section>`).join('');
  return `<div data-first-visit-document><section data-first-visit-part="hero" id="intro" aria-labelledby="first-visit-title"><div data-first-visit-part="artwork" aria-hidden="true"><div data-first-visit-part="plate"></div><div data-first-visit-part="plateTrailing"></div></div><div data-first-visit-part="veil" aria-hidden="true"></div><div data-first-visit-part="logo"><span data-first-visit-part="rise"><span data-first-visit-part="logoImage" role="img" aria-label="Swelldays"></span></span></div><div data-first-visit-part="content"><div data-first-visit-part="message"><h1 tabindex="-1" id="first-visit-title" data-first-visit-part="title"><span data-first-visit-part="rise">${e(content.hero.heading)}</span></h1><div data-first-visit-paths>${paths}</div></div></div></section></div>`;
}

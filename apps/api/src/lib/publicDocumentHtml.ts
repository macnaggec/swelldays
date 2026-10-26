import { type PublicDocument } from '@swelldays/contracts/core';

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function publicDocumentHtml(document: PublicDocument): string {
  const links = (items: typeof document.links) => items.map((link) => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join('');
  return `<article class="public-document"><h1>${escapeHtml(document.heading)}</h1><p>${escapeHtml(document.intro)}</p>${document.sections.map((section) => `<section><h2>${escapeHtml(section.heading)}</h2><p>${escapeHtml(section.text)}</p></section>`).join('')}<p>${links(document.links)}</p></article>`;
}

export function injectInitialBody(shell: string, body: string): string {
  // The root's closing tag is adjacent to the module script in Vite's shell.
  // Match to that boundary rather than stopping at a nested bootstrap div.
  const root = /(<div id="root">)[\s\S]*?(<\/div>\s*(?:(?:<!--[\s\S]*?-->)\s*)?(?:<script\b|<\/body>))/;
  if (!root.test(shell)) throw new Error('Public document root unavailable');
  return shell.replace(root, (_match, open: string, close: string) => `${open}${body}${close}`);
}

export function injectPublicDocument(shell: string, document: PublicDocument): string {
  return injectInitialBody(shell, publicDocumentHtml(document));
}

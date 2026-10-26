import { describe, expect, it } from 'vitest';
import { injectHead } from './htmlHead';

const SHELL_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="description" content="Default description" />
  <meta property="og:title" content="Default title" />
  <meta property="og:description" content="Default og description" />
  <meta property="og:image" content="/default-image.png" />
  <meta name="twitter:title" content="Default title" />
  <meta name="twitter:description" content="Default og description" />
  <meta name="twitter:image" content="/default-image.png" />
  <title>Default title</title>
</head>
<body>
  <div id="root"></div>
</body>
</html>
`;

describe('injectHead', () => {
  it('replaces the title, description, OG, and Twitter tags with page-specific copy', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'Pipeline Surf Photos & Videos — Oahu, Hawaii | Swelldays',
      description: 'Browse and buy surf photos and videos from Pipeline in Oahu, Hawaii, searchable by date.',
      canonicalUrl: 'https://swelldays.surf/pipeline-id',
    });

    expect(html).toContain('<title>Pipeline Surf Photos &amp; Videos — Oahu, Hawaii | Swelldays</title>');
    expect(html).toContain('<meta name="description" content="Browse and buy surf photos and videos from Pipeline in Oahu, Hawaii, searchable by date." />');
    expect(html).toContain('<meta property="og:title" content="Pipeline Surf Photos &amp; Videos — Oahu, Hawaii | Swelldays" />');
    expect(html).toContain('<meta property="og:description" content="Browse and buy surf photos and videos from Pipeline in Oahu, Hawaii, searchable by date." />');
    expect(html).toContain('<meta name="twitter:title" content="Pipeline Surf Photos &amp; Videos — Oahu, Hawaii | Swelldays" />');
    expect(html).toContain('<meta name="twitter:description" content="Browse and buy surf photos and videos from Pipeline in Oahu, Hawaii, searchable by date." />');
  });

  it('appends a canonical link before </head>', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'T',
      description: 'D',
      canonicalUrl: 'https://swelldays.surf/gallery',
    });

    expect(html).toContain('<link rel="canonical" href="https://swelldays.surf/gallery" />');
    expect(html.indexOf('rel="canonical"')).toBeLessThan(html.indexOf('</head>'));
  });

  it('uses an absolute public default image when no imageUrl is given', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'T',
      description: 'D',
      canonicalUrl: 'https://swelldays.surf/gallery',
    });

    expect(html).toContain('<meta property="og:image" content="https://swelldays.surf/android-chrome-512x512.png" />');
    expect(html).toContain('<meta name="twitter:image" content="https://swelldays.surf/android-chrome-512x512.png" />');
  });

  it('replaces og:image and twitter:image when an imageUrl is given', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'T',
      description: 'D',
      canonicalUrl: 'https://swelldays.surf/gallery',
      imageUrl: 'https://res.cloudinary.com/demo/session-thumb.jpg',
    });

    expect(html).toContain('<meta property="og:image" content="https://res.cloudinary.com/demo/session-thumb.jpg" />');
    expect(html).toContain('<meta name="twitter:image" content="https://res.cloudinary.com/demo/session-thumb.jpg" />');
  });

  it('appends one JSON-LD script per entry', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'T',
      description: 'D',
      canonicalUrl: 'https://swelldays.surf/spot-id',
      jsonLd: [
        { '@context': 'https://schema.org', '@type': 'Place', name: 'Pipeline' },
        { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [] },
      ],
    });

    const scriptMatches = html.match(/<script type="application\/ld\+json">/g) ?? [];
    expect(scriptMatches).toHaveLength(2);
    expect(html).toContain('"@type":"Place"');
    expect(html).toContain('"@type":"BreadcrumbList"');
  });

  it('does not corrupt output when title/description contain "$" replacement-pattern characters', () => {
    const html = injectHead(SHELL_HTML, {
      title: '$100 Point Surf Photos & Videos | Swelldays',
      description: 'Sessions at $& Point, priced from $$5.',
      canonicalUrl: 'https://swelldays.surf/dollar-point',
    });

    expect(html).toContain('<title>$100 Point Surf Photos &amp; Videos | Swelldays</title>');
    expect(html).toContain('<meta name="description" content="Sessions at $&amp; Point, priced from $$5." />');
  });

  it('escapes HTML-significant characters in title and description', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'Spot <script>alert(1)</script> & Co',
      description: 'A "quoted" description with <tags>',
      canonicalUrl: 'https://swelldays.surf/xss-id',
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('Spot &lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(html).toContain('content="A &quot;quoted&quot; description with &lt;tags&gt;"');
  });

  it('escapes "</script>" inside JSON-LD payloads so it cannot close the script tag early', () => {
    const html = injectHead(SHELL_HTML, {
      title: 'T',
      description: 'D',
      canonicalUrl: 'https://swelldays.surf/spot-id',
      jsonLd: [{ '@context': 'https://schema.org', '@type': 'Place', name: '</script><script>alert(1)</script>' }],
    });

    expect(html).not.toContain('</script><script>alert(1)</script>');
    expect(html).toContain('\\u003c/script>\\u003cscript>alert(1)\\u003c/script>');
  });
});

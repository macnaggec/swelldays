import type { Position } from '@swelldays/contracts';

export function placeJsonLd(spot: { name: string; location: string; coords: Position }): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: spot.name,
    address: spot.location,
    geo: {
      '@type': 'GeoCoordinates',
      latitude: spot.coords.lat,
      longitude: spot.coords.lng,
    },
  };
}

export function breadcrumbListJsonLd(items: Array<{ name: string; url: string }>): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

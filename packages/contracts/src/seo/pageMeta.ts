/**
 * Page title/description copy shared by the web app's client-side route
 * heads and the API's server-rendered metadata shim, so the two never drift
 * apart into two different descriptions of the same page.
 */

type SpotNameLocation = { name: string; location: string };
type SessionSpotSummary = { spot: SpotNameLocation };

export const HOME_PAGE_TITLE = 'Swelldays | Buy and Sell Surf Photos & Videos';
export const HOME_PAGE_DESCRIPTION = 'Swelldays is an interactive map for finding, buying, and selling surf-spot photos and videos, searchable by date.';

export const ABOUT_PAGE_TITLE = 'About | Swelldays';
export const ABOUT_PAGE_DESCRIPTION = 'Swelldays is a map of surf spots. Photographers publish photos and videos from their sessions, and surfers search, preview, and buy them by spot and date.';

export const GALLERY_PAGE_TITLE = 'Surf Photo & Video Gallery | Swelldays';
export const GALLERY_PAGE_DESCRIPTION = 'Browse surf-spot photos and videos on Swelldays, searchable by spot and date.';

export function spotPageTitle(spot: SpotNameLocation): string {
  return `${spot.name} Surf Photos & Videos — ${spot.location} | Swelldays`;
}

export function spotPageDescription(spot: SpotNameLocation): string {
  return `Browse and buy surf photos and videos from ${spot.name} in ${spot.location}, searchable by date.`;
}

export function spotGalleryTitle(spot: SpotNameLocation): string {
  return `${spot.name} Photo & Video Gallery — ${spot.location} | Swelldays`;
}

export function spotGalleryDescription(spot: SpotNameLocation): string {
  return `Browse and buy surf photos and videos from ${spot.name} in ${spot.location}.`;
}

export function sessionPageTitle(session: SessionSpotSummary, shortDate: string): string {
  return `${session.spot.name} Surf Session — ${shortDate} | Swelldays`;
}

export function sessionPageDescription(session: SessionSpotSummary, dateRangeLabel: string): string {
  return `Browse and buy surf photos and videos from a session at ${session.spot.name}, ${session.spot.location} on ${dateRangeLabel}.`;
}

import type { Spot } from '../types/spot';
import type { SurfSessionItem } from '../types/surfSession';
import {
  HOME_PAGE_TITLE, HOME_PAGE_DESCRIPTION, ABOUT_PAGE_TITLE, ABOUT_PAGE_DESCRIPTION,
  GALLERY_PAGE_TITLE, GALLERY_PAGE_DESCRIPTION, spotPageTitle, spotPageDescription,
  spotGalleryTitle, spotGalleryDescription, sessionPageTitle, sessionPageDescription,
} from './pageMeta';

export const PUBLIC_ORIGIN = 'https://swelldays.surf';
export const DEFAULT_SOCIAL_IMAGE = `${PUBLIC_ORIGIN}/android-chrome-512x512.png`;
export const SELLER_EARNINGS_COPY = 'Earnings are the sale price minus applicable deductions, which depend on the payment provider. Review your earnings in your account. You can request a payout from Earnings when your available balance reaches $20. Payouts are processed manually; no processing time is guaranteed.';

export type PublicDocumentLink = { href: string; label: string };
export type PublicDocument = {
  path: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  sections: Array<{ heading: string; text: string }>;
  links: PublicDocumentLink[];
  imageUrl?: string;
  noindex?: boolean;
  jsonLd: Record<string, unknown>[];
};

export function publicCanonical(path: string): string {
  return new URL(path, PUBLIC_ORIGIN).toString();
}

export function publicShortDate(value: Date | string): string {
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

export function publicDateRange(startsAt: Date | string, endsAt: Date | string): string {
  const time = (value: Date | string) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' });
  return `${publicShortDate(startsAt)} · ${time(startsAt)}–${time(endsAt)} UTC`;
}

export function publicBreadcrumbs(items: PublicDocumentLink[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.label, item: publicCanonical(item.href) })),
  };
}

export type StaticPublicPage = 'home' | 'about' | 'gallery' | 'buyer' | 'seller';

export function staticPublicDocument(page: StaticPublicPage): PublicDocument {
  const content: Record<StaticPublicPage, Omit<PublicDocument, 'jsonLd'>> = {
    home: {
      path: '/', title: HOME_PAGE_TITLE, description: HOME_PAGE_DESCRIPTION,
      heading: 'Buy and Sell Surf Photos & Videos', intro: HOME_PAGE_DESCRIPTION,
      sections: [{ heading: 'Find your session', text: 'Choose your surf spot and date, browse published sessions, and preview photos and videos of your waves. Availability depends on what photographers publish.' }],
      links: [],
    },
    buyer: {
      path: '/buy-surf-photos', title: 'Find and Buy Your Surf Photos & Videos | Swelldays',
      description: 'Find photos and videos from your surf session by spot and date. Browse previews and follow checkout for the media you choose.',
      heading: 'Find Your Surf Photos & Videos', intro: 'Look for photos and videos of your own surf session, published by photographers at your spot.',
      sections: [
        { heading: '1. Find your spot and date', text: 'Open the gallery, select the spot where you surfed, and use the date filter to narrow the available media.' },
        { heading: '2. Preview your waves', text: 'Browse published sessions and preview the photos and videos. Choose the media you want and add priced items to your cart.' },
        { heading: '3. Checkout and access purchases', text: 'Review your cart and follow the available checkout. After payment is confirmed and the purchase is fulfilled, use Purchases to access the supported original-download flow.' },
        { heading: 'What if my session is missing?', text: 'Only published sessions are available. Try another date or check with the photographer who was shooting. Swelldays cannot guarantee that your session was photographed or uploaded.' },
        { heading: 'Are previews the original files?', text: 'Previews help you choose. Purchased media has a separate download flow; a preview is not the original download.' },
      ], links: [{ href: '/gallery', label: 'Find my surf photos' }],
    },
    seller: {
      path: '/sell-surf-photos', title: 'Sell Surf Photos & Videos Online | Swelldays',
      description: 'Publish surf photos and videos by spot and session date, set supported prices, and help surfers find your work on Swelldays.',
      heading: 'Sell Your Surf Photos & Videos', intro: 'Publish the sessions you photograph so surfers can find their waves by spot and date.',
      sections: [
        { heading: '1. Sign in and open Upload', text: 'Upload is connected to your account. Sign in or create an account from Upload, then continue there to prepare your session.' },
        { heading: '2. Add your spot, date and prices', text: 'Choose the spot where you shot, add your photos and videos, check the session details, and set supported prices before publishing.' },
        { heading: '3. Publish for surfers to discover', text: 'Published sessions appear in discovery by spot and date. Share your session link with surfers who were there. Previews and purchased-original downloads use separate flows.' },
        { heading: 'Fees, earnings and payouts', text: SELLER_EARNINGS_COPY },
        { heading: 'When will I receive a payout?', text: 'Request a payout from Earnings after reaching the available-balance threshold. Processing is manual. Contact support about current arrangements before relying on a payout date.' },
      ], links: [{ href: '/upload', label: 'Start uploading' }],
    },
    gallery: {
      path: '/gallery', title: GALLERY_PAGE_TITLE, description: GALLERY_PAGE_DESCRIPTION,
      heading: 'Surf Photo & Video Gallery', intro: 'Browse published surf-session photos and videos, then narrow the gallery by spot and date.', sections: [], links: [],
    },
    about: {
      path: '/about', title: ABOUT_PAGE_TITLE, description: ABOUT_PAGE_DESCRIPTION,
      heading: 'About Swelldays', intro: ABOUT_PAGE_DESCRIPTION,
      sections: [
        { heading: 'For surfers', text: 'Find your session by spot and date, preview media, and follow checkout for your selected photos and videos.' },
        { heading: 'For photographers', text: 'Upload a session, attach a spot, set supported prices and publish for surfers to discover.' },
        { heading: 'Earnings and payouts', text: SELLER_EARNINGS_COPY },
        { heading: 'Feedback', text: 'Found a bug or have an idea? Email macnaggec@gmail.com.' },
      ], links: [{ href: 'mailto:macnaggec@gmail.com', label: 'Send feedback' }],
    },
  };
  const document = content[page];
  return {
    ...document,
    jsonLd: page === 'home'
      ? [{ '@context': 'https://schema.org', '@type': 'WebSite', name: 'Swelldays', url: `${PUBLIC_ORIGIN}/` }]
      : [publicBreadcrumbs([{ href: '/', label: 'Swelldays' }, { href: document.path, label: document.heading }])],
  };
}

export function sessionPublicLink(session: Pick<SurfSessionItem, 'id' | 'spot' | 'startsAt'>): PublicDocumentLink {
  return { href: `/${session.spot.slug}/session/${session.id}`, label: `${session.spot.name} — ${publicShortDate(session.startsAt)}` };
}

export function spotPublicDocument(spot: Spot, gallery: boolean, sessions: SurfSessionItem[]): PublicDocument {
  const heading = gallery ? `${spot.name} Photo & Video Gallery` : `${spot.name} Surf Photos & Videos`;
  const path = `/${spot.slug}${gallery ? '/gallery' : ''}`;
  const document: PublicDocument = {
    path, heading, title: gallery ? spotGalleryTitle(spot) : spotPageTitle(spot),
    description: gallery ? spotGalleryDescription(spot) : spotPageDescription(spot),
    intro: gallery ? `Preview published media from ${spot.name}, ${spot.location}. Use the date filter to browse your visit.` : `Find published surf sessions at ${spot.name}, ${spot.location}. Open a session to preview its photos and videos.`,
    sections: sessions.some((session) => session.mediaCount > 0) ? [] : [{ heading: 'No published media here yet', text: 'Check another spot or come back after a photographer publishes a session.' }],
    links: [{ href: `/${spot.slug}${gallery ? '' : '/gallery'}`, label: gallery ? `${spot.name} sessions` : `${spot.name} gallery` }],
    imageUrl: sessions.find((session) => session.mediaCount > 0)?.thumbnailUrl ?? undefined,
    noindex: !sessions.some((session) => session.mediaCount > 0),
    jsonLd: [
      { '@context': 'https://schema.org', '@type': 'Place', name: spot.name, address: spot.location, geo: { '@type': 'GeoCoordinates', latitude: spot.coords.lat, longitude: spot.coords.lng } },
      publicBreadcrumbs([{ href: '/', label: 'Swelldays' }, { href: `/${spot.slug}`, label: spot.name }, ...(gallery ? [{ href: path, label: 'Gallery' }] : [])]),
    ],
  };
  return document;
}

export function sessionPublicDocument(session: SurfSessionItem): PublicDocument {
  const path = sessionPublicLink(session).href;
  const date = publicShortDate(session.startsAt);
  return {
    path, title: sessionPageTitle(session, date),
    description: sessionPageDescription(session, publicDateRange(session.startsAt, session.endsAt)),
    heading: `${session.spot.name} Surf Session — ${date}`,
    intro: `${publicDateRange(session.startsAt, session.endsAt)} · ${session.spot.location}. ${session.mediaCount} published media items. Photographer: ${session.photographer.name ?? 'Unnamed photographer'}.`,
    sections: session.mediaCount > 0 ? [] : [{ heading: 'No published media in this session', text: 'Browse other sessions at this spot.' }],
    links: [{ href: `/${session.spot.slug}`, label: `${session.spot.name} sessions` }, { href: `/${session.spot.slug}/gallery`, label: `${session.spot.name} gallery` }],
    imageUrl: session.thumbnailUrl ?? undefined, noindex: session.mediaCount === 0,
    jsonLd: [publicBreadcrumbs([{ href: '/', label: 'Swelldays' }, { href: `/${session.spot.slug}`, label: session.spot.name }, { href: path, label: `Session — ${date}` }])],
  };
}

export function serializePublicJsonLd(value: Record<string, unknown>): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

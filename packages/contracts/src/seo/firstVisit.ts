export interface FirstVisitPath {
  id: 'surfer' | 'photographer';
  audience: string;
  heading: string;
  intro: string;
  action: { href: string; label: string };
}

/** The two public journeys share their copy between initial HTML and React. */
export const FIRST_VISIT_CONTENT: {
  hero: { heading: string };
  paths: readonly FirstVisitPath[];
  noScript: string;
} = {
  hero: { heading: 'Surf photos & videos' },
  paths: [
    {
      id: 'surfer', audience: 'For surfers', heading: 'Find your surf photos',
      intro: 'Find photos and videos from your surf session by spot and date. Browse published sessions, preview your waves and buy the shots you want to keep.',
      action: { href: '/#map', label: 'Find my photos' },
    },
    {
      id: 'photographer', audience: 'For photographers', heading: 'Sell surf photos',
      intro: 'Sell your surf photos and videos on Swelldays. Upload a session, choose the spot and date, set prices and publish so surfers can find your work.',
      action: { href: '/upload', label: 'Start uploading' },
    },
  ],
  noScript: 'Enable JavaScript to explore the map.',
};

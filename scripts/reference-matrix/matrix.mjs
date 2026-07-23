/**
 * Reference-matrix definition: viewport bands × drawer intent × drawer state.
 *
 * The viewport axis is mobile-first (roadmap F12b): compact is the base band,
 * constrained and wide are additive. Wide is captured today as the
 * desktop-parity baseline; compact and constrained slots are filled as their
 * phases (M, T) land.
 *
 * Each state's `run` is the executable reproduction recipe — the scripted
 * equivalent of the "Reproduction" column in the F00 manual reference README.
 * States call `d.capture()` explicitly so timing-sensitive states (loading)
 * control their own capture moment.
 */

export const BANDS = [
  {
    name: 'compact',
    mobile: true,
    viewports: [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 430, height: 932 },
      { width: 932, height: 430 },
    ],
  },
  {
    name: 'constrained',
    mobile: false,
    viewports: [
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
    ],
  },
  {
    name: 'wide',
    mobile: false,
    viewports: [
      { width: 1280, height: 800 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ],
  },
];

/** Seeded dev-database records the reproductions depend on (see F00 README). */
const SEEDED = {
  cangguSpotId: '6f712023-7ad5-48a2-b1a5-077bffd1e654',
  cangguSessionId: '7356deba-0497-4132-9704-0ba26891a52d',
  unavailableWorkspaceId: '5247ca97-57cf-45ae-8f57-000b14d2cc72',
};

/**
 * Toggle the shared panel expand/collapse control into the wanted state.
 * The control's aria-label reflects the action it offers, so the label's
 * presence tells us the current state.
 */
async function ensurePanelExpansion(d, wanted) {
  const label = wanted === 'expanded' ? 'Expand panel' : 'Collapse panel';
  const clicked = await d.clickByLabel(label, { optional: true });
  if (clicked) await d.settle();
}

export const STATES = [
  {
    name: 'browse-compact',
    description: 'Open / with the default compact browse preference.',
    run: async (d) => {
      await d.goto('/');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'browse-expanded',
    description: 'Open /, then activate "Expand panel".',
    run: async (d) => {
      await d.goto('/');
      await d.settle();
      await ensurePanelExpansion(d, 'expanded');
      await d.capture();
    },
  },
  {
    name: 'gallery-compact',
    description: 'Open /gallery, then ensure the panel is collapsed.',
    run: async (d) => {
      await d.goto('/gallery');
      await d.settle();
      await ensurePanelExpansion(d, 'compact');
      await d.capture();
    },
  },
  {
    name: 'gallery-expanded',
    description: 'Open /gallery, then ensure the panel is expanded.',
    run: async (d) => {
      await d.goto('/gallery');
      await d.settle();
      await ensurePanelExpansion(d, 'expanded');
      await d.capture();
    },
  },
  {
    name: 'session-detail',
    description: 'Open the seeded Canggu session detail route.',
    run: async (d) => {
      await d.goto(`/${SEEDED.cangguSpotId}/session/${SEEDED.cangguSessionId}`);
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'cart',
    description: 'Open /cart with an empty cart (fresh profile).',
    run: async (d) => {
      await d.goto('/cart');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'account',
    description: 'Open /me while signed in.',
    run: async (d) => {
      await d.goto('/me');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'collections',
    description: 'Open /me/collections while signed in.',
    run: async (d) => {
      await d.goto('/me/collections');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'earnings',
    description: 'Open /me/earnings while signed in.',
    run: async (d) => {
      await d.goto('/me/earnings');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'upload-map-input',
    description: 'Open /upload while signed in with no active workspace.',
    run: async (d) => {
      await d.goto('/upload');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'loading',
    description: 'Hard-navigate to / under network throttling and capture the initial query/map-loading frame.',
    run: async (d) => {
      await d.gotoThrottled('/');
      await d.capture();
      await d.clearThrottling();
    },
  },
  {
    name: 'empty-today',
    description: 'Open /, then activate the "Today" filter; the seeded database has no matching sessions.',
    run: async (d) => {
      await d.goto('/');
      await d.settle();
      await d.clickByText('Today');
      await d.settle();
      await d.capture();
    },
  },
  {
    name: 'error-upload-workspace',
    description: 'Open the seeded non-draft upload workspace; its lifecycle renders the unavailable state.',
    run: async (d) => {
      await d.goto(`/upload?workspaceId=${SEEDED.unavailableWorkspaceId}`);
      await d.settle();
      await d.waitForText('This upload workspace is unavailable');
      await d.capture();
    },
  },
  {
    name: 'dialog-delete-account',
    description: 'Open /me, then activate "Delete account" to open the confirmation dialog.',
    run: async (d) => {
      await d.goto('/me');
      await d.settle();
      await d.clickByText('Delete account');
      await d.settle();
      await d.capture();
    },
  },
];

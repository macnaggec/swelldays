import { LayerProps, Fog } from 'react-map-gl';

// Mapbox paint specs take plain JS, not CSS custom properties, so these are
// kept as local constants in sync with tokens.css.
//
// Individual spots and clusters share ONE dark-glass chip material so they read
// as a single marker family, differentiated only by size and content (the blue
// wave glyph vs a count). The dark navy echoes --wa-surface-status and the globe
// background, and keeps both the blue wave and white counts high-contrast over
// bright (sand, whitewater, cloud) and dark (deep water) satellite imagery alike.
// Canvas has no backdrop-filter, so alpha is boosted and a diffuse shadow supplies
// separation from the imagery instead of blur.
const MARKER_CHIP_COLOR = 'rgba(51, 65, 85, 0.85)';
const MARKER_CHIP_BORDER = 'rgba(255, 255, 255, 0.4)';
const MARKER_SHADOW_COLOR = 'rgba(0, 0, 0, 0.28)';
// --wa-accent-spot (#63b3ed): the single blue accent, used as the cluster ring.
const MARKER_ACCENT = 'rgba(99, 179, 237, 0.32)';
// Selection state mirrors the selected filter pill: the selection accent at full opacity.
// The chip fill must stay dark — the wave glyph is itself accent-blue, so an accent fill
// would erase it. The accent takes the ring instead, backed by a stronger halo and a
// slightly larger chip so selected reads apart from normal at a glance.
const MARKER_SELECTED_RING = 'rgba(99, 179, 237, 1)';
const MARKER_SELECTED_HALO = 'rgba(99, 179, 237, 0.5)';

// One shadow under the round chip (individual + selected), sized just past the
// chip so it peeks as a soft lift rather than a second visible ring.
const markerShadowPaint = {
  'circle-color': MARKER_SHADOW_COLOR,
  'circle-radius': 15,
  'circle-blur': 0.6,
  'circle-translate': [0, 1] as [number, number],
} as const;

export const SPOT_INTERACTIVE_LAYERS: string[] = [
  'cluster-halo',
  'clusters',
  'unclustered-point-halo',
  'unclustered-point',
  'unclustered-point-icon',
  'selected-spot-point',
  'selected-spot-icon',
];

export const globeFog: Fog = {
  color: 'rgb(186, 210, 235)',
  'high-color': 'rgb(36, 92, 223)',
  'horizon-blend': 0.02,
  'space-color': 'rgb(10, 22, 40)',
  'star-intensity': 0.6,
};

// The cluster's blue accent ring: a soft glow behind the chip that grows with the
// point count, so a denser cluster reads as heavier at a glance. This is the only
// element that distinguishes a cluster chip from an individual chip's material.
export const clusterHaloLayer: LayerProps = {
  id: 'cluster-halo',
  type: 'circle',
  source: 'spots',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': MARKER_ACCENT,
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['get', 'point_count'],
      2, 22,
      10, 25,
      50, 30,
      250, 35,
    ],
    'circle-blur': 0.4,
  },
};

export const clusterLayer: LayerProps = {
  id: 'clusters',
  type: 'circle',
  source: 'spots',
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': MARKER_CHIP_COLOR,
    'circle-radius': [
      'interpolate',
      ['linear'],
      ['get', 'point_count'],
      2, 16,
      10, 19,
      50, 23,
      250, 27,
    ],
    'circle-stroke-width': 1.5,
    'circle-stroke-color': MARKER_CHIP_BORDER,
  },
};

export const clusterCountLayer: LayerProps = {
  id: 'cluster-count',
  type: 'symbol',
  source: 'spots',
  filter: ['has', 'point_count'],
  layout: {
    'text-field': '{point_count_abbreviated}',
    'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': [
      'step',
      ['get', 'point_count'],
      13,
      10, 14,
      100, 15,
    ],
    'text-allow-overlap': true,
    'text-ignore-placement': true,
  },
  paint: {
    'text-color': 'rgba(255, 255, 255, 0.96)',
    'text-halo-color': 'rgba(10, 22, 40, 0.72)',
    'text-halo-width': 0.5,
  },
};

export const unclusteredPointHaloLayer: LayerProps = {
  id: 'unclustered-point-halo',
  type: 'circle',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-radius': 22,
    'circle-opacity': 0,
  },
};

export const unclusteredPointLayer: LayerProps = {
  id: 'unclustered-point',
  type: 'circle',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  paint: {
    'circle-color': MARKER_CHIP_COLOR,
    'circle-radius': 13,
    'circle-stroke-width': 1,
    'circle-stroke-color': MARKER_CHIP_BORDER,
  },
};

export const unclusteredPointShadowLayer: LayerProps = {
  id: 'unclustered-point-shadow',
  type: 'circle',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  paint: markerShadowPaint,
};

export const iconLayer: LayerProps = {
  id: 'unclustered-point-icon',
  type: 'symbol',
  source: 'spots',
  filter: ['!', ['has', 'point_count']],
  layout: {
    'icon-image': 'custom-marker',
    'icon-size': 0.105,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
  paint: {
    'icon-opacity': 1,
  },
};

// Selected spot lives in its own always-unclustered source (see GlobeMapComponent),
// so it stays individually visible instead of being folded into a cluster while
// zooming out — which would otherwise leave its popup pointing at a cluster.
export const selectedSpotPointLayer: LayerProps = {
  id: 'selected-spot-point',
  type: 'circle',
  source: 'selected-spot',
  paint: {
    'circle-color': MARKER_CHIP_COLOR,
    'circle-radius': 15,
    'circle-stroke-width': 2.5,
    'circle-stroke-color': MARKER_SELECTED_RING,
  },
};

export const selectedSpotShadowLayer: LayerProps = {
  id: 'selected-spot-shadow',
  type: 'circle',
  source: 'selected-spot',
  // Shadow sized just past the larger selected chip, same +2 offset as the normal chip's.
  paint: { ...markerShadowPaint, 'circle-radius': 17 },
};

export const selectedSpotGlowLayer: LayerProps = {
  id: 'selected-spot-glow',
  type: 'circle',
  source: 'selected-spot',
  paint: {
    'circle-color': MARKER_SELECTED_HALO,
    'circle-radius': 22,
    'circle-blur': 0.6,
  },
};

export const selectedSpotIconLayer: LayerProps = {
  id: 'selected-spot-icon',
  type: 'symbol',
  source: 'selected-spot',
  layout: {
    'icon-image': 'custom-marker',
    // Scaled with the 13 → 15 chip so the glyph keeps its proportion inside the ring.
    'icon-size': 0.12,
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
  paint: {
    'icon-opacity': 1,
  },
};

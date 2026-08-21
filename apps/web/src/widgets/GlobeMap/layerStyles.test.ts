import { describe, expect, it } from 'vitest';
import {
  clusterLayer,
  clusterHaloLayer,
  iconLayer,
  unclusteredPointLayer,
  selectedSpotIconLayer,
  selectedSpotGlowLayer,
  selectedSpotPointLayer,
} from './layerStyles';

type CirclePaint = { 'circle-color'?: string; 'circle-stroke-color'?: string };
const paint = (layer: { paint?: unknown }) => layer.paint as CirclePaint;

describe('spot marker presentation', () => {
  it('draws individual spots, clusters, and the selected spot from one glass-chip material', () => {
    // The unification rule: all three marker chips share the same dark-glass fill,
    // so they read as a single family differentiated only by size and content.
    // Drift here reintroduces the old white-vs-navy split.
    const chip = paint(unclusteredPointLayer)['circle-color'];
    const border = paint(unclusteredPointLayer)['circle-stroke-color'];

    expect(chip).toBe('rgba(51, 65, 85, 0.85)');
    expect(paint(clusterLayer)['circle-color']).toBe(chip);
    expect(paint(selectedSpotPointLayer)['circle-color']).toBe(chip);

    expect(paint(clusterLayer)['circle-stroke-color']).toBe(border);
  });

  it('marks the selected spot with the opaque selection-accent ring, distinct from normal chips', () => {
    // Same rule as the selected filter pill: selection = --wa-accent-spot at full
    // opacity. The fill stays dark (the wave glyph is itself accent-blue), so the
    // accent lives on the ring; a hairline ring here makes selected unreadable.
    expect(selectedSpotPointLayer).toMatchObject({
      paint: {
        'circle-stroke-color': 'rgba(99, 179, 237, 1)',
        'circle-stroke-width': 2.5,
        'circle-radius': 15,
      },
    });
  });

  it('distinguishes a cluster only by a blue accent ring that grows with the count', () => {
    expect(paint(clusterHaloLayer)['circle-color']).toBe('rgba(99, 179, 237, 0.32)');
    expect(clusterHaloLayer).toMatchObject({
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'point_count'], 2, 22, 10, 25, 50, 30, 250, 35],
        'circle-blur': 0.4,
      },
    });
  });

  it('marks the selected spot with one accent glow, no second rim', () => {
    // The glow uses the same accent family as the ring (one selection color),
    // not the separate --wa-accent-marker blue.
    expect(selectedSpotGlowLayer).toMatchObject({
      paint: {
        'circle-color': 'rgba(99, 179, 237, 0.5)',
        'circle-radius': 22,
        'circle-blur': 0.6,
      },
    });
  });

  it('keeps the native blue wave glyph untinted, scaled to its chip', () => {
    expect(iconLayer).toMatchObject({
      layout: { 'icon-image': 'custom-marker', 'icon-size': 0.105 },
    });
    // Selected chip is 15px vs the normal 13px; the glyph scales with it.
    expect(selectedSpotIconLayer).toMatchObject({
      layout: { 'icon-image': 'custom-marker', 'icon-size': 0.12 },
    });
    for (const layer of [iconLayer, selectedSpotIconLayer]) {
      // No icon-color: the glyph keeps its own blue, never tinted by the map.
      expect(layer.paint).not.toHaveProperty('icon-color');
    }
  });
});

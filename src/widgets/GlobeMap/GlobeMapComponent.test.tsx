import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GlobeMapComponent } from './GlobeMapComponent';
import { SPOT_INTERACTIVE_LAYERS } from './layerStyles';
import type { Spot } from 'entities/Spot';
import type { LngLat } from 'shared/types/coordinates';

const mocks = vi.hoisted(() => ({
  loadImages: vi.fn(),
  onUserInteractionEnd: vi.fn(),
  onUserInteractionStart: vi.fn(),
  saveCameraState: vi.fn(),
  startSpinning: vi.fn(),
  stopSpinning: vi.fn(),
  tempPinMarker: vi.fn(),
  selectedSpotPopup: vi.fn(),
  flyTo: vi.fn(),
  easeTo: vi.fn(),
  setPadding: vi.fn(),
  getZoom: vi.fn(() => 1.5),
}));

vi.mock('mapbox-gl', () => ({
  default: {},
}));

vi.mock('react-map-gl', () => ({
  default: ({
    children,
    cursor,
    initialViewState,
    interactiveLayerIds,
    interactive,
    onClick,
    onDragStart,
    onMouseDown,
    onZoomStart,
    onLoad,
    onMouseEnter,
    onMoveEnd,
    onWheel,
    boxZoom,
    doubleClickZoom,
    dragPan,
    dragRotate,
    keyboard,
    scrollZoom,
    touchPitch,
    touchZoomRotate,
  }: {
    children: ReactNode;
    cursor?: string;
    initialViewState?: unknown;
    interactiveLayerIds?: string[];
    interactive?: boolean;
    onClick?: (event: { lngLat: { lng: number; lat: number } }) => void;
    onDragStart?: (event: { originalEvent?: Event }) => void;
    onMouseDown?: () => void;
    onZoomStart?: (event: { originalEvent?: Event }) => void;
    onLoad: (event: { target: unknown }) => void;
    onMouseEnter?: () => void;
    onMoveEnd?: (event: { viewState: { longitude: number; latitude: number; zoom: number; pitch: number; bearing: number } }) => void;
    onWheel?: () => void;
    boxZoom?: boolean;
    doubleClickZoom?: boolean;
    dragPan?: boolean;
    dragRotate?: boolean;
    keyboard?: boolean;
    scrollZoom?: boolean;
    touchPitch?: boolean;
    touchZoomRotate?: boolean;
  }) => (
    <div>
      <button
        type="button"
        data-initial-view-state={JSON.stringify(initialViewState)}
        onClick={() => onLoad({ target: {
          easeTo: mocks.easeTo,
          flyTo: mocks.flyTo,
          getZoom: mocks.getZoom,
          setPadding: mocks.setPadding,
        } })}
      >
        Load map
        {children}
      </button>
      <button
        type="button"
        data-cursor={cursor}
        data-interactive-layers={interactiveLayerIds?.join(',') ?? ''}
        data-interactive={String(interactive)}
        data-map-handlers={[
          boxZoom,
          doubleClickZoom,
          dragPan,
          dragRotate,
          keyboard,
          scrollZoom,
          touchPitch,
          touchZoomRotate,
        ].map(String).join(',')}
        onClick={() => onClick?.({ lngLat: { lng: 151.2, lat: -33.85 } })}
      >
        Click map
      </button>
      <button type="button" onClick={() => onMouseEnter?.()}>
        Enter spot
      </button>
      <button type="button" onClick={() => onDragStart?.({ originalEvent: new MouseEvent('mousedown') })}>
        Drag globe
      </button>
      <button type="button" onClick={() => onZoomStart?.({ originalEvent: new WheelEvent('wheel') })}>
        Zoom globe
      </button>
      <button type="button" onClick={() => onZoomStart?.({ originalEvent: undefined })}>
        Programmatic zoom
      </button>
      <button type="button" onClick={() => onMouseDown?.()}>
        Press globe
      </button>
      <button type="button" onClick={() => onWheel?.()}>
        Wheel globe
      </button>
      <button
        type="button"
        onClick={() => onMoveEnd?.({
          viewState: { longitude: 1, latitude: 2, zoom: 3, pitch: 4, bearing: 5 },
        })}
      >
        Move end
      </button>
    </div>
  ),
  Layer: () => null,
  Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Source: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@mantine/core', () => ({
  Loader: () => <div>Loading</div>,
  Paper: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));

vi.mock('widgets/GlobeMap/model/mapStore', () => ({
  useMapStore: (selector: (state: unknown) => unknown) => selector({
    cameraState: {
      longitude: 115.085,
      latitude: -8.815,
      zoom: 1.5,
      pitch: 0,
      bearing: 0,
    },
    saveCameraState: mocks.saveCameraState,
  }),
}));

vi.mock('./hooks/useGlobeAnimation', () => ({
  useGlobeAnimation: () => ({
    onUserInteractionEnd: mocks.onUserInteractionEnd,
    onUserInteractionStart: mocks.onUserInteractionStart,
    startSpinning: mocks.startSpinning,
    stopSpinning: mocks.stopSpinning,
  }),
}));

vi.mock('./hooks/useSpotGeoJson', () => ({
  useSpotGeoJson: () => ({
    type: 'FeatureCollection',
    features: [],
  }),
}));

vi.mock('./hooks/useMapInteraction', () => ({
  useMapInteraction: ({ spots, onSpotClick }: { spots: Spot[]; onSpotClick?: (spot: Spot) => void }) => ({
    cursor: 'grab',
    hoveredSpot: spots[0] ?? null,
    onMapClick: () => {
      const spot = spots[0];
      if (spot) onSpotClick?.(spot);
    },
    onMouseEnter: vi.fn(),
    onMouseLeave: vi.fn(),
  }),
}));

vi.mock('./hooks/useMapImages', () => ({
  useMapImages: () => ({
    loadImages: mocks.loadImages,
  }),
}));

vi.mock('./ui/TempPinMarker', () => ({
  TempPinMarker: (props: { tempPin: LngLat | null; isActive: boolean }) => {
    mocks.tempPinMarker(props);
    return null;
  },
}));

vi.mock('./ui/SelectedSpotPopup', () => ({
  SelectedSpotPopup: (props: { spot: Spot }) => {
    mocks.selectedSpotPopup(props);
    return null;
  },
}));

const spots: Spot[] = [
  {
    id: 'spot-1',
    name: 'Uluwatu',
    location: 'Bali, Indonesia',
    coords: { lng: 115.085, lat: -8.815 },
  },
];

describe('GlobeMapComponent motion policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts ambient spin on load when the scene requests ambient motion', () => {
    render(<GlobeMapComponent spots={spots} onSpotSelect={vi.fn()} motionPolicy="ambientSpin" />);

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    return waitFor(() => {
      expect(mocks.startSpinning).toHaveBeenCalledTimes(1);
    });
  });

  it.each(['paused', 'disabled'] as const)('does not start ambient spin on load when motion is %s', (motionPolicy) => {
    render(<GlobeMapComponent spots={spots} onSpotSelect={vi.fn()} motionPolicy={motionPolicy} />);

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    expect(mocks.startSpinning).not.toHaveBeenCalled();
  });
});

describe('GlobeMapComponent coordinate picking', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports coordinate clicks upward while coordinate picking is active', () => {
    const onMapCoordinateClick = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        isCoordinatePickerActive={true}
        tempPin={[151, -34]}
        onMapCoordinateClick={onMapCoordinateClick}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /click map/i }));

    expect(onMapCoordinateClick).toHaveBeenCalledWith([151.2, -33.85]);
    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute('data-cursor', 'crosshair');
    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute('data-interactive-layers', '');
    expect(mocks.tempPinMarker).toHaveBeenCalledWith({ tempPin: [151, -34], isActive: true });
  });
});

describe('GlobeMapComponent interaction policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks camera gestures while backgrounded but keeps spot clicks and hover popups working', () => {
    const onSpotSelect = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={onSpotSelect}
        motionPolicy="paused"
        interactionPolicy="background"
      />,
    );

    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute('data-interactive', 'true');
    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute(
      'data-interactive-layers',
      SPOT_INTERACTIVE_LAYERS.join(','),
    );
    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute(
      'data-map-handlers',
      'false,false,false,false,false,false,false,false',
    );
    expect(screen.getByText('Uluwatu')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    fireEvent.click(screen.getByRole('button', { name: /click map/i }));

    expect(onSpotSelect).toHaveBeenCalledWith(spots[0]);
    expect(mocks.flyTo).toHaveBeenCalled();
  });

  it('keeps Mapbox camera handlers enabled while interactive', () => {
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="interactive"
      />,
    );

    expect(screen.getByRole('button', { name: /click map/i })).toHaveAttribute(
      'data-map-handlers',
      'true,true,true,true,true,true,true,true',
    );
  });

  it('reports genuine drag and zoom starts without treating pointer-down or spot clicks as camera gestures', () => {
    const onCameraGestureStart = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="interactive"
        onCameraGestureStart={onCameraGestureStart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /press globe/i }));
    fireEvent.click(screen.getByRole('button', { name: /click map/i }));
    expect(onCameraGestureStart).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /drag globe/i }));
    fireEvent.click(screen.getByRole('button', { name: /zoom globe/i }));
    expect(onCameraGestureStart).toHaveBeenCalledTimes(2);
  });

  it('does not treat programmatic selected-spot recentering as a camera gesture', () => {
    const onCameraGestureStart = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="interactive"
        onCameraGestureStart={onCameraGestureStart}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /programmatic zoom/i }));

    expect(onCameraGestureStart).not.toHaveBeenCalled();
  });

  it('does not report user exploration while backgrounded', () => {
    const onUserExploreStart = vi.fn();
    const onUserExploreEnd = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="background"
        onUserExploreStart={onUserExploreStart}
        onUserExploreEnd={onUserExploreEnd}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /drag globe/i }));
    fireEvent.click(screen.getByRole('button', { name: /wheel globe/i }));
    fireEvent.click(screen.getByRole('button', { name: /move end/i }));

    expect(onUserExploreStart).not.toHaveBeenCalled();
    expect(onUserExploreEnd).not.toHaveBeenCalled();
  });
});

describe('GlobeMapComponent decorative interaction policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not fire onSpotSelect when a spot is clicked while decorative', () => {
    const onSpotSelect = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={onSpotSelect}
        motionPolicy="paused"
        interactionPolicy="decorative"
      />,
    );

    // The globe container is `inert` while decorative, which removes its descendants
    // from the accessible tree — `hidden: true` reaches this mocked map's own inert
    // buttons the same way a real assistive-tech pass would skip them.
    fireEvent.click(screen.getByRole('button', { name: /load map/i, hidden: true }));
    fireEvent.click(screen.getByRole('button', { name: /click map/i, hidden: true }));

    expect(onSpotSelect).not.toHaveBeenCalled();
  });

  it('does not show the hover tooltip popup while decorative', () => {
    render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="decorative"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /enter spot/i, hidden: true }));

    expect(screen.queryByText('Uluwatu')).not.toBeInTheDocument();
  });

  it('does not render the selected-spot popup while decorative, even with a spot selected', () => {
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="decorative"
      />,
    );

    expect(mocks.selectedSpotPopup).not.toHaveBeenCalled();
  });

  it('marks the globe container inert and hidden from the accessibility tree while decorative', () => {
    const { container } = render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="decorative"
      />,
    );

    const globeContainer = container.firstElementChild as HTMLElement;
    expect(globeContainer).toHaveAttribute('aria-hidden', 'true');
    expect(globeContainer).toHaveAttribute('inert');
  });

  it('carries neither aria-hidden nor inert while interactive', () => {
    const { container } = render(
      <GlobeMapComponent
        spots={spots}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="interactive"
      />,
    );

    const globeContainer = container.firstElementChild as HTMLElement;
    expect(globeContainer).not.toHaveAttribute('aria-hidden');
    expect(globeContainer).not.toHaveAttribute('inert');
  });
});

describe('GlobeMapComponent selected spot focus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getZoom.mockReturnValue(1.5);
  });

  it('runs a pending route focus after the map loads', async () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );
    expect(mocks.flyTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    await waitFor(() => {
      expect(mocks.flyTo).toHaveBeenCalledWith({
        center: [115.085, -8.815],
        zoom: 12,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        duration: 1000,
        essential: true,
      });
    });
  });

  it('focuses an initially selected spot with the insets present when the map loads', async () => {
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 72, right: 0, bottom: 84, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    await waitFor(() => {
      expect(mocks.flyTo).toHaveBeenCalledWith({
        center: [115.085, -8.815],
        zoom: 12,
        padding: { top: 72, right: 0, bottom: 84, left: 0 },
        duration: 1000,
        essential: true,
      });
    });
  });

  it('focuses a newly selected route spot once after the map has loaded', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledTimes(1);
    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="disabled"
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledTimes(1);
  });

  it('skips the initial focus animation duration when reduced motion disables globe motion', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="disabled"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="disabled"
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
  });

  it('focuses a selected route spot when its spot record arrives after map load', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={[]}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    expect(mocks.flyTo).not.toHaveBeenCalled();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });
  });

  it('focuses a selected route spot when its spot record arrives before map load', async () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={[]}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );
    expect(mocks.flyTo).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    await waitFor(() => {
      expect(mocks.flyTo).toHaveBeenCalledWith({
        center: [115.085, -8.815],
        zoom: 12,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        duration: 1000,
        essential: true,
      });
    });
  });

  it('does not let an earlier local click suppress a later route focus to the same spot', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    fireEvent.click(screen.getByRole('button', { name: /click map/i }));

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });
    mocks.flyTo.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });
  });

  it('moves the camera to a clicked spot before reporting selection', () => {
    const onSpotSelect = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={onSpotSelect}
        motionPolicy="paused"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    fireEvent.click(screen.getByRole('button', { name: /click map/i }));

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });
    expect(onSpotSelect).toHaveBeenCalledWith(spots[0]);
    const flyToCallOrder = mocks.flyTo.mock.invocationCallOrder[0];
    const selectionCallOrder = onSpotSelect.mock.invocationCallOrder[0];
    expect(flyToCallOrder).toBeDefined();
    expect(selectionCallOrder).toBeDefined();
    expect(flyToCallOrder!).toBeLessThan(selectionCallOrder!);
  });

  it('does not re-run the focus camera move when clicking the already-selected spot', () => {
    const onSpotSelect = vi.fn();
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={onSpotSelect}
        motionPolicy="paused"
      />,
    );

    // Map load triggers the one-time route-driven focus.
    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    mocks.flyTo.mockClear();
    mocks.easeTo.mockClear();

    // Clicking the marker for the already-selected spot must not restart the focus.
    fireEvent.click(screen.getByRole('button', { name: /click map/i }));

    expect(mocks.flyTo).not.toHaveBeenCalled();
    expect(mocks.easeTo).not.toHaveBeenCalled();
    expect(onSpotSelect).toHaveBeenCalledWith(spots[0]);
  });

  it('reserves the given right camera inset as right padding so the spot centers in the visible part of the map', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 500, bottom: 0, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 500, bottom: 0, left: 0 }}
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 500, bottom: 0, left: 0 },
      duration: 1000,
      essential: true,
    });
  });

  it('reserves the given bottom camera inset as bottom padding so the spot centers in the visible part of the map', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 400, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 400, left: 0 }}
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 400, left: 0 },
      duration: 1000,
      essential: true,
    });
  });
});

describe('GlobeMapComponent selected spot popup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the selected-spot popup once the spot is selected', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    expect(mocks.selectedSpotPopup).not.toHaveBeenCalled();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
      />,
    );

    expect(mocks.selectedSpotPopup).toHaveBeenCalledWith({ spot: spots[0] });
  });

  it('still renders the selected-spot popup while backgrounded, since the sidebar covering the map is the point', () => {
    render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        interactionPolicy="background"
      />,
    );

    expect(mocks.selectedSpotPopup).toHaveBeenCalledWith({ spot: spots[0] });
  });
});

describe('GlobeMapComponent camera inset changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getZoom.mockReturnValue(12);
  });

  it('defers selected spot focus until a covered sheet reveals the map', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        selectedSpotFocusEnabled={false}
        cameraInsetsPx={{ top: 0, right: 0, bottom: 116, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        selectedSpotFocusEnabled={false}
        cameraInsetsPx={{ top: 0, right: 0, bottom: 116, left: 0 }}
      />,
    );

    expect(mocks.easeTo).not.toHaveBeenCalled();
    expect(mocks.flyTo).not.toHaveBeenCalled();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        selectedSpotFocusEnabled
        cameraInsetsPx={{ top: 0, right: 0, bottom: 116, left: 0 }}
      />,
    );

    expect(mocks.easeTo).toHaveBeenCalledTimes(1);
    expect(mocks.easeTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      padding: { top: 0, right: 0, bottom: 116, left: 0 },
      duration: 600,
      essential: true,
    });

    mocks.easeTo.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        selectedSpotFocusEnabled={false}
        cameraInsetsPx={{ top: 0, right: 0, bottom: 116, left: 0 }}
      />,
    );

    expect(mocks.easeTo).not.toHaveBeenCalled();
    expect(mocks.flyTo).not.toHaveBeenCalled();
  });

  it('recenters the selected spot against the final right inset when a side panel lands', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 250, bottom: 0, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 250, bottom: 0, left: 0 }}
      />,
    );
    mocks.easeTo.mockClear();
    mocks.flyTo.mockClear();
    mocks.setPadding.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 750, bottom: 0, left: 0 }}
      />,
    );

    expect(mocks.easeTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      padding: { top: 0, right: 750, bottom: 0, left: 0 },
      duration: 600,
      essential: true,
    });
    expect(mocks.flyTo).not.toHaveBeenCalled();
    expect(mocks.setPadding).not.toHaveBeenCalled();
  });

  it('recenters the selected spot against the final bottom inset when a sheet lands', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 250, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 250, left: 0 }}
      />,
    );
    mocks.easeTo.mockClear();
    mocks.flyTo.mockClear();
    mocks.setPadding.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 750, left: 0 }}
      />,
    );

    expect(mocks.easeTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      padding: { top: 0, right: 0, bottom: 750, left: 0 },
      duration: 600,
      essential: true,
    });
    expect(mocks.flyTo).not.toHaveBeenCalled();
    expect(mocks.setPadding).not.toHaveBeenCalled();
  });

  it('retargets an interrupted overview flight to the selected spot and final inset', () => {
    mocks.getZoom.mockReturnValue(1.5);
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 84, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 84, left: 0 }}
      />,
    );
    mocks.flyTo.mockClear();
    mocks.setPadding.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 0, bottom: 400, left: 0 }}
      />,
    );

    expect(mocks.flyTo).toHaveBeenCalledWith({
      center: [115.085, -8.815],
      zoom: 12,
      padding: { top: 0, right: 0, bottom: 400, left: 0 },
      duration: 1000,
      essential: true,
    });
    expect(mocks.setPadding).not.toHaveBeenCalled();
  });

  it('skips the recenter animation duration when reduced motion disables globe motion', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="disabled"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId="spot-1"
        onSpotSelect={vi.fn()}
        motionPolicy="disabled"
      />,
    );

    expect(mocks.easeTo).toHaveBeenCalledWith(expect.objectContaining({ duration: 0 }));
  });

  it('does not move the camera when insets change with no spot selected', () => {
    const { rerender } = render(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 250, bottom: 0, left: 0 }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /load map/i }));
    mocks.easeTo.mockClear();
    mocks.setPadding.mockClear();

    rerender(
      <GlobeMapComponent
        spots={spots}
        selectedSpotId={null}
        onSpotSelect={vi.fn()}
        motionPolicy="paused"
        cameraInsetsPx={{ top: 0, right: 750, bottom: 0, left: 0 }}
      />,
    );

    expect(mocks.easeTo).not.toHaveBeenCalled();
    expect(mocks.setPadding).not.toHaveBeenCalled();
  });
});

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CameraState {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
}

const DEFAULT_CAMERA: CameraState = {
  longitude: 115.085,
  latitude: -8.815,
  zoom: 1.5,
  pitch: 0,
  bearing: 0,
};

interface MapStore {
  cameraState: CameraState;
  saveCameraState: (camera: CameraState) => void;
}

export const useMapStore = create<MapStore>()(
  persist(
    (set) => ({
      cameraState: DEFAULT_CAMERA,
      saveCameraState: (camera) => set({ cameraState: camera }),
    }),
    {
      name: 'swelldays-map',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

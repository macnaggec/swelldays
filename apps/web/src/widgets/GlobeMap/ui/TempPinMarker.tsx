import { Marker } from 'react-map-gl';
import type { LngLat } from '@swelldays/contracts';
import classes from '../GlobeMap.module.css';

interface TempPinMarkerProps {
  tempPin: LngLat | null;
  isActive: boolean;
}

export function TempPinMarker({ tempPin, isActive }: TempPinMarkerProps) {
  if (!tempPin || !isActive) return null;

  return (
    <Marker longitude={tempPin[0]} latitude={tempPin[1]} anchor="center">
      <div className={classes.tempPin} />
    </Marker>
  );
}

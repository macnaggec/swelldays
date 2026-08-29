import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useAddSpotStore } from './addSpotStore';
import { useCreateSpot, useNearbySpots } from 'entities/Spot';
import { spotNameSchema, spotLocationSchema } from '@swelldays/contracts/validation/spot';
import { notify } from 'shared/lib/notifications';
import { getErrorMessage } from 'shared/lib/getErrorMessage';
import { useReverseGeocode } from './useReverseGeocode';
import { toCreateSpotCoordinates } from './addSpotCoordinates';
import type { Spot } from 'entities/Spot';

export type AddSpotStep = 'hint' | 'form' | 'proximity';

export interface AddSpotFlowState {
  step: AddSpotStep;
  name: string;
  location: string;
  isGeocoding: boolean;
  nearbySpots: Spot[];
  /** Nearby check + create both pending — drives the FormStep submit button. */
  isSubmitting: boolean;
  /** Create mutation pending only — drives the ProximityStep confirm button. */
  isCreating: boolean;
  nameError: string | null;
  locationError: string | null;
  setName: (v: string) => void;
  setLocation: (v: string) => void;
  cancel: () => void;
  backToPin: () => void;
  backToForm: () => void;
  submitForm: () => void;
  confirmCreate: () => void;
  goToExisting: (spot: Spot) => void;
}

export function useAddSpotFlow(): AddSpotFlowState {
  const navigate = useNavigate();

  const {
    tempPin,
    pendingSpotName,
    exit: exitAddSpot,
    clearTempPin
  } = useAddSpotStore();

  const [step, setStep] = useState<AddSpotStep>('hint');
  const [name, setName] = useState(pendingSpotName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [nearbySpots, setNearbySpots] = useState<Spot[]>([]);
  const [isCheckingNearby, setIsCheckingNearby] = useState(false);

  const {
    location,
    isLoading: isGeocoding,
    geocode,
    setLocation
  } = useReverseGeocode();

  const createMutation = useCreateSpot();
  const fetchNearbySpots = useNearbySpots();

  useEffect(() => {
    if (tempPin && step === 'hint') {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: advance after map location selection
      setStep('form');
      geocode(tempPin);
    }
  }, [tempPin, step, geocode]);

  const cancel = useCallback(() => {
    exitAddSpot();
  }, [exitAddSpot]);

  const backToPin = useCallback(() => {
    clearTempPin();
    setStep('hint');
    setLocation('');
  }, [clearTempPin, setLocation]);

  const create = useCallback(async () => {
    if (!tempPin) return;
    const coords = toCreateSpotCoordinates(tempPin);

    const spot = await createMutation.mutateAsync({
      name: name.trim(),
      location: location.trim(),
      lat: coords.lat,
      lng: coords.lng,
    });

    exitAddSpot();

    void navigate({ to: '/$spotId', params: { spotId: spot.slug } });
  }, [
    tempPin,
    name,
    location,
    createMutation,
    exitAddSpot,
    navigate
  ]);

  const handleSetName = useCallback((v: string) => {
    setName(v);
    setNameError(null);
  }, []);

  const handleSetLocation = useCallback((v: string) => {
    setLocation(v);
    setLocationError(null);
  }, [setLocation]);

  const handleSubmitForm = useCallback(async () => {
    if (!tempPin) return;
    const nameResult = spotNameSchema.safeParse(name.trim());
    const locationResult = spotLocationSchema.safeParse(location.trim());
    if (!nameResult.success) setNameError(nameResult.error.issues[0]!.message);
    if (!locationResult.success) setLocationError(locationResult.error.issues[0]!.message);
    if (!nameResult.success || !locationResult.success) return;
    const coords = toCreateSpotCoordinates(tempPin);
    setIsCheckingNearby(true);
    try {
      const nearby = await fetchNearbySpots(coords.lat, coords.lng);
      if (nearby.length > 0) {
        setNearbySpots(nearby);
        setStep('proximity');
      } else {
        await create();
      }
    } catch (err) {
      notify.error(getErrorMessage(err), 'Failed to create spot');
    } finally {
      setIsCheckingNearby(false);
    }
  }, [tempPin, name, location, fetchNearbySpots, create]);

  const goToExisting = useCallback((spot: Spot) => {
    exitAddSpot();
    void navigate({ to: '/$spotId', params: { spotId: spot.slug } });
  }, [exitAddSpot, navigate]);

  return {
    step,
    name,
    location,
    isGeocoding,
    nearbySpots,
    nameError,
    locationError,
    isSubmitting: isCheckingNearby || createMutation.isPending,
    isCreating: createMutation.isPending,
    setName: handleSetName,
    setLocation: handleSetLocation,
    cancel,
    backToPin,
    backToForm: () => setStep('form'),
    submitForm: () => { void handleSubmitForm(); },
    confirmCreate: () => { void create(); },
    goToExisting,
  };
}

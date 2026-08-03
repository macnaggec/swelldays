import { useState } from 'react';
import { Paper } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import { DrawerShell, useRegisterSheetScrollOwner, type SheetSnap } from 'shared/ui/DrawerShell';
import { useAppShellLayoutPolicy } from 'shared/model/appShellPresentation';
import { useAddSpotFlow } from '../model/useAddSpotFlow';
import styles from './AddSpotPanel.module.css';
import { HintStep } from './steps/HintStep';
import { FormStep } from './steps/FormStep';
import { ProximityStep } from './steps/ProximityStep';

export function AddSpotPanel() {
  const flow = useAddSpotFlow();
  const layoutPolicy = useAppShellLayoutPolicy();
  const registerScrollOwner = useRegisterSheetScrollOwner();
  const [snap, setSnap] = useState<SheetSnap>('half');
  const [renderedStep, setRenderedStep] = useState(flow.step);
  if (renderedStep !== flow.step) {
    setRenderedStep(flow.step);
    // The form step is the only one with a focused text input; jump to the tallest
    // snap so the keyboard has room without covering the Add/Cancel row.
    if (flow.step === 'form') setSnap('full');
  }

  const stepContent = (
    <>
      {flow.step === 'hint' && <HintStep onCancel={flow.cancel} />}
      {flow.step === 'form' && (
        <FormStep
          name={flow.name}
          location={flow.location}
          nameError={flow.nameError}
          locationError={flow.locationError}
          isGeocoding={flow.isGeocoding}
          isSubmitting={flow.isSubmitting}
          onNameChange={flow.setName}
          onLocationChange={flow.setLocation}
          onBack={flow.backToPin}
          onCancel={flow.cancel}
          onSubmit={flow.submitForm}
        />
      )}
      {flow.step === 'proximity' && (
        <ProximityStep
          nearbySpots={flow.nearbySpots}
          isCreating={flow.isCreating}
          onGoToExisting={flow.goToExisting}
          onConfirmCreate={flow.confirmCreate}
          onBack={flow.backToForm}
          onCancel={flow.cancel}
        />
      )}
    </>
  );

  if (layoutPolicy.drawer.presentation === 'hidden') {
    return (
      <Paper
        shadow="xl"
        radius="md"
        p="xs"
        withBorder
        className={`${styles.panel} ${materialClasses.status}`}
      >
        {stepContent}
      </Paper>
    );
  }

  const modality = layoutPolicy.drawer.modality === 'modal' ? 'modal' : 'nonmodal';

  return layoutPolicy.drawer.presentation === 'bottomSheet' ? (
    <DrawerShell presentation="bottomSheet" modality={modality} snap={snap} onSnapChange={setSnap}>
      <div ref={registerScrollOwner} className={styles.drawerContent}>
        {stepContent}
      </div>
    </DrawerShell>
  ) : (
    <DrawerShell presentation="sideOverlay" state="expanded" modality={modality}>
      <div ref={registerScrollOwner} className={styles.drawerContent}>
        {stepContent}
      </div>
    </DrawerShell>
  );
}

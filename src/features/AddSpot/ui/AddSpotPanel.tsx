import { Paper } from '@mantine/core';
import { materialClasses } from 'shared/ui/design-system';
import { DrawerShell, useRegisterSheetScrollOwner } from 'shared/ui/DrawerShell';
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
        component="aside"
        aria-label="Add spot"
        p={0}
        className={`${styles.panel} ${materialClasses.status}`}
      >
        <div className={styles.drawerContent}>{stepContent}</div>
      </Paper>
    );
  }

  const modality = layoutPolicy.drawer.modality === 'modal' ? 'modal' : 'nonmodal';

  return layoutPolicy.drawer.presentation === 'bottomSheet' ? (
    <DrawerShell presentation="bottomSheet" modality={modality} sizing="content">
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

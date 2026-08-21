import { notifications } from '@mantine/notifications';
import { validateFileBatch } from 'entities/Media';

/**
 * Validates a batch of dropped/selected files, shows appropriate notifications,
 * and calls onAdd with the valid subset.
 *
 * Extracted from UploadZone.tsx to break the component-to-component utility
 * dependency (StepModeModal imported handleFileSelection from a sibling component).
 */
export function handleFileSelection(files: File[], onAdd: (files: File[]) => void): void {
  if (!files.length) return;
  const { valid, validFiles, errors, warnings } = validateFileBatch(files);
  if (!valid) {
    notifications.show({ title: 'Upload Error', message: errors.join('\n'), color: 'red', autoClose: 8000 });
    if (validFiles.length > 0)
      notifications.show({ title: 'Partial Upload', message: `${validFiles.length} of ${files.length} files will be uploaded`, color: 'yellow', autoClose: 5000 });
    if (warnings.length > 0)
      notifications.show({ title: 'Upload Warning', message: warnings.join('\n'), color: 'yellow', autoClose: 5000 });
  } else if (warnings.length > 0) {
    notifications.show({ title: 'Upload Warning', message: warnings.join('\n'), color: 'yellow', autoClose: 5000 });
  }
  if (validFiles.length > 0)
    onAdd(validFiles);
}

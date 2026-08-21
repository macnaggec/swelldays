import { useCallback, useState } from 'react';
import { notify } from 'shared/lib/notifications';
import type { DriveSelection } from './uploadCoordinator';

const DRIVE_READONLY_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const PICKER_MIME_TYPES = [
  'image/jpeg','image/png','image/gif','image/webp',
  'image/tiff','image/heic','image/heif',
  'video/mp4','video/quicktime','video/x-msvideo','video/webm','video/mpeg',
].join(',');

export async function requestDriveAccessToken(): Promise<string> {
  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Sign-in is not available yet. Please try again.');
  }
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      scope: DRIVE_READONLY_SCOPE,
      callback: (r) => r.error || !r.access_token
        ? reject(new Error('Google Drive access was denied.'))
        : resolve(r.access_token),
      error_callback: () => reject(new Error('Google Drive authorization failed.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function loadGooglePicker(): Promise<void> {
  if (!window.gapi) throw new Error('Google Picker is not loaded yet.');
  await Promise.race([
    new Promise<void>(resolve => gapi.load('picker', resolve)),
    new Promise<never>((_, r) => setTimeout(() => r(new Error('Picker timed out.')), 10_000)),
  ]);
}

export function useGooglePicker(
  onSelection: (selections: DriveSelection[], accessToken: string) => Promise<void>,
) {
  const [isLoading, setIsLoading] = useState(false);

  const trigger = useCallback(async () => {
    setIsLoading(true);
    try {
      const accessToken = await requestDriveAccessToken();
      await loadGooglePicker();

      await new Promise<void>((resolve, reject) => {
        const picker = new google.picker.PickerBuilder()
          .addView(
            new google.picker.DocsView(google.picker.ViewId.DOCS)
              .setMimeTypes(PICKER_MIME_TYPES)
              .setIncludeFolders(false),
          )
          .setOAuthToken(accessToken)
          .setDeveloperKey(import.meta.env.VITE_GOOGLE_API_KEY ?? '')
          .enableFeature(google.picker.Feature.MULTISELECT_ENABLED)
          .setTitle('Select photos or videos from Google Drive')
          .setCallback(async (data: google.picker.PickerResponseObject) => {
            if (data.action === google.picker.Action.CANCEL) { resolve(); return; }
            if (data.action === google.picker.Action.PICKED) {
              const selections: DriveSelection[] = (data.docs ?? []).map(doc => ({
                remoteFileId: doc.id,
                declaredMimeType: doc.mimeType,
                thumbnailUrl: doc.thumbnails?.[0]?.url ?? doc.url ?? '',
                accessToken,
              }));
              try { await onSelection(selections, accessToken); resolve(); }
              catch (err) { reject(err); }
            }
          })
          .build();
        picker.setVisible(true);
      });
    } catch (err) {
      notify.error(err instanceof Error ? err.message : 'Google Drive import failed.', 'Drive Error');
    } finally {
      setIsLoading(false);
    }
  }, [onSelection]);

  return { trigger, isPickerLoading: isLoading };
}

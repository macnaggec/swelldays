import { afterEach, describe, expect, it, vi } from 'vitest';
import * as googlePickerModule from './useGooglePicker';

type GooglePickerModuleWithLoader = typeof googlePickerModule & {
  loadGoogleDriveApis?: () => Promise<void>;
};

const GOOGLE_API_SRC = 'https://apis.google.com/js/api.js';
const GOOGLE_IDENTITY_SRC = 'https://accounts.google.com/gsi/client';

afterEach(() => {
  document.querySelectorAll('[data-google-drive-api]').forEach((script) => script.remove());
  delete window.gapi;
  Reflect.deleteProperty(window, 'google');
  vi.restoreAllMocks();
});

describe('Google Drive API loading', () => {
  it('loads each Google dependency once when Drive import is requested', async () => {
    const loadGoogleDriveApis = (googlePickerModule as GooglePickerModuleWithLoader).loadGoogleDriveApis;

    expect(loadGoogleDriveApis).toBeTypeOf('function');
    if (!loadGoogleDriveApis) return;

    const firstLoad = loadGoogleDriveApis();
    const secondLoad = loadGoogleDriveApis();
    const scripts = Array.from(document.querySelectorAll<HTMLScriptElement>('[data-google-drive-api]'));

    expect(scripts.map((script) => script.src).sort()).toEqual([
      GOOGLE_API_SRC,
      GOOGLE_IDENTITY_SRC,
    ].sort());
    expect(scripts).toHaveLength(2);
    expect(scripts.every((script) => script.async && script.defer)).toBe(true);

    window.gapi = { load: vi.fn() };
    window.google = {
      accounts: { oauth2: { initTokenClient: vi.fn() } },
    } as unknown as typeof google;
    scripts.forEach((script) => script.dispatchEvent(new Event('load')));

    await expect(Promise.all([firstLoad, secondLoad])).resolves.toEqual([undefined, undefined]);
  });

  it('loads Google Identity before requesting a Drive token', async () => {
    const tokenResult = googlePickerModule.requestDriveAccessToken().then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    );
    await Promise.resolve();

    const identityScript = document.querySelector<HTMLScriptElement>(
      `[data-google-drive-api][src="${GOOGLE_IDENTITY_SRC}"]`,
    );

    expect(identityScript).not.toBeNull();
    if (!identityScript) return;

    window.google = {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn((config: google.accounts.oauth2.TokenClientConfig) => ({
            requestAccessToken: () => config.callback({ access_token: 'drive-token' }),
          })),
        },
      },
    } as unknown as typeof google;
    identityScript.dispatchEvent(new Event('load'));

    await expect(tokenResult).resolves.toEqual({ value: 'drive-token' });
  });
});

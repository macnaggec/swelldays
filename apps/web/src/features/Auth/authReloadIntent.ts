import type { AuthMode } from './ui/AuthPage';

const AUTH_RELOAD_INTENT_STORAGE_KEY = 'swelldays:auth-reload-intent:v1';

export function writeAuthReloadIntent(mode: AuthMode): void {
  try {
    window.sessionStorage.setItem(AUTH_RELOAD_INTENT_STORAGE_KEY, mode);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts. The
    // reload still proceeds; it just won't reopen the sign-in form on its own.
  }
}

export function consumeAuthReloadIntent(): AuthMode | null {
  try {
    const mode = window.sessionStorage.getItem(AUTH_RELOAD_INTENT_STORAGE_KEY);
    if (mode !== 'login' && mode !== 'register') return null;
    window.sessionStorage.removeItem(AUTH_RELOAD_INTENT_STORAGE_KEY);
    return mode;
  } catch {
    return null;
  }
}

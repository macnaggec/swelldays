export const FIRST_VISIT_STORAGE_KEY = 'swelldays:first-visit:v1';

export function readFirstVisitAcknowledgement(): boolean {
  try {
    return window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY) === 'seen';
  } catch {
    return false;
  }
}

export function writeFirstVisitAcknowledgement(): void {
  try {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, 'seen');
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts. The
    // visitor can still enter; only the cross-visit acknowledgement is lost.
  }
}

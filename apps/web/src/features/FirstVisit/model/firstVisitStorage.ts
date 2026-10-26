import { FIRST_VISIT_ACKNOWLEDGEMENT, FIRST_VISIT_STORAGE_KEY } from './firstVisitPolicy';

export { FIRST_VISIT_STORAGE_KEY };

export function readFirstVisitAcknowledgement(): boolean {
  try {
    return window.localStorage.getItem(FIRST_VISIT_STORAGE_KEY) === FIRST_VISIT_ACKNOWLEDGEMENT;
  } catch {
    return false;
  }
}

export function writeFirstVisitAcknowledgement(): void {
  try {
    window.localStorage.setItem(FIRST_VISIT_STORAGE_KEY, FIRST_VISIT_ACKNOWLEDGEMENT);
  } catch {
    // Storage can be unavailable in privacy-restricted browsing contexts. The
    // visitor can still enter; only the cross-visit acknowledgement is lost.
  }
}

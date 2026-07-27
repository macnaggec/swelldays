import { createContext, useContext, type Context } from 'react';

export type RegisterSheetScrollOwner = (element: HTMLElement | null) => void;

export const SheetScrollOwnerContext: Context<RegisterSheetScrollOwner | null> =
  createContext<RegisterSheetScrollOwner | null>(null);

const noopRegisterSheetScrollOwner: RegisterSheetScrollOwner = () => {};

/**
 * Registers the panel's scroll owner with an enclosing bottom sheet so the sheet can
 * arbitrate between scrolling the list and moving itself. A no-op outside a bottom
 * sheet, which is every presentation today.
 */
export function useRegisterSheetScrollOwner(): RegisterSheetScrollOwner {
  const register = useContext(SheetScrollOwnerContext);
  return register ?? noopRegisterSheetScrollOwner;
}

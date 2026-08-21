import { createContext, useContext, type Context } from 'react';

export type RegisterSheetScrollOwner = (element: HTMLElement | null) => void;

export const SheetScrollOwnerContext: Context<RegisterSheetScrollOwner | null> =
  createContext<RegisterSheetScrollOwner | null>(null);

export const SheetContentScrollContext: Context<boolean | null> =
  createContext<boolean | null>(null);

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

/**
 * Whether the panel's scroll owner may scroll its content. False while an enclosing
 * bottom sheet is below its top snap: the list is parked there, so an upward swipe
 * drags the sheet up instead of moving the cards. True outside a sheet.
 */
export function useSheetContentScrollable(): boolean {
  const contentScrollable = useContext(SheetContentScrollContext);
  return contentScrollable ?? true;
}

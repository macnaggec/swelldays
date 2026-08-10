export function dismissActiveTextEntry(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;

  if (
    activeElement instanceof HTMLInputElement
    || activeElement instanceof HTMLTextAreaElement
    || activeElement.isContentEditable
  ) {
    activeElement.blur();
    return true;
  }

  return false;
}

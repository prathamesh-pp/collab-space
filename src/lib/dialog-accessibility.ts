export type DialogKeyboardEvent = {
  key: string;
  preventDefault(): void;
};

export function closeDialogOnEscape(
  event: DialogKeyboardEvent,
  onClose: () => void,
) {
  if (event.key !== "Escape") return false;
  event.preventDefault();
  onClose();
  return true;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }
  if (target instanceof HTMLElement && target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest('[contenteditable="true"]'));
}

export function isInteractiveControlTarget(target: EventTarget | null): boolean {
  if (!target || typeof Element === 'undefined' || !(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      'button, a[href], summary, [role="button"], [role="radio"], [role="checkbox"], [role="slider"], input, textarea, select'
    )
  );
}

export function hasBlockingUiDialog(): boolean {
  if (typeof document === 'undefined') return false;
  return Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'));
}

export function releaseActiveElementFocus(): void {
  if (typeof document === 'undefined') return;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== document.body) {
    active.blur();
  }
}

export function focusGameplayCanvas(): void {
  if (typeof document === 'undefined') return;
  releaseActiveElementFocus();
  const canvas = document.querySelector('#root canvas');
  if (canvas instanceof HTMLCanvasElement) {
    if (!canvas.hasAttribute('tabindex')) {
      canvas.setAttribute('tabindex', '-1');
    }
    canvas.style.outline = 'none';
    canvas.focus({ preventScroll: true });
  }
  if (typeof window !== 'undefined' && typeof window.focus === 'function') {
    window.focus();
  }
}

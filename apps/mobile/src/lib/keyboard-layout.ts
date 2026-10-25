/** Scroll only the missing distance inside the measured viewport. Native Android
 * may already have resized it; subtracting a keyboard height again is incorrect. */
export function inputScrollOffset(
  scrollY: number,
  viewportY: number,
  viewportHeight: number,
  inputY: number,
  inputHeight: number,
  extraBottom = 16,
): number {
  if (viewportHeight <= 0) return scrollY;
  const padding = Math.min(extraBottom, viewportHeight / 4);
  if (inputHeight > viewportHeight - padding) return Math.max(0, scrollY + inputY - viewportY);
  if (inputY < viewportY) return Math.max(0, scrollY + inputY - viewportY - padding);
  return Math.max(0, scrollY + Math.max(0, inputY + inputHeight - (viewportY + viewportHeight - padding)));
}

/** Fixed 44px fields must not overlap when Android reports a keyboard-shortened
 * window, or on a short landscape tablet. 393x852 keeps its original geometry. */
export function loginCanvasHeight(height: number): number {
  return Math.max(600, height);
}

/** Whether the 1920×1080 stage is turned 90° clockwise to use a portrait phone screen as landscape. */
export const stageView = { rotated: false };

/**
 * Pointer position in the element's own unscaled CSS pixels, undoing the stage scale and rotation.
 * `offsetWidth` is the element's untransformed width.
 */
export function localPoint(e: { clientX: number; clientY: number }, el: HTMLElement): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  if (stageView.rotated) {
    const s = r.height / (el.offsetWidth || r.height);
    return { x: (e.clientY - r.top) / s, y: (r.right - e.clientX) / s };
  }
  const s = r.width / (el.offsetWidth || r.width);
  return { x: (e.clientX - r.left) / s, y: (e.clientY - r.top) / s };
}

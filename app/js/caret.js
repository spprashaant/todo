// Fitting a caret mirror's text to its field (shared by detail.js, composer.js and when.js).
//
// The app's text fields hide the native caret and draw their own bar where a hidden block, set in the
// field's font, says the insertion point falls. Android scales a page's text with the system font size
// (the WebView's text zoom, Chrome's text autosizing) but leaves the text inside form controls alone, so
// such a block renders the same text wider than the field does, and the bar lands further right of the
// real insertion point the longer the line is. Measuring one probe string in a clone of the field and in a
// block with the field's font gives the ratio, and the mirror's font is scaled back by it so both agree.
// Where the two already agree (every desktop browser), the mirror keeps the field's own size.

const PROBE = 'The quick brown fox jumps over the lazy dog 0123456789 '.repeat(4);
const FONT = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontStretch', 'fontVariant', 'fontFeatureSettings',
  'fontVariationSettings', 'fontKerning', 'fontOpticalSizing', 'letterSpacing', 'wordSpacing', 'textTransform'];
const fitted = new WeakMap(); // field -> { key, size }

/** The font size (CSS px) that renders `field`'s text in a block as wide as the field itself renders it. */
export function mirrorFontSize(field, cs = getComputedStyle(field)) {
  const size = parseFloat(cs.fontSize);
  const key = FONT.map(p => cs[p]).join('|');
  const known = fitted.get(field);
  if (known && known.key === key) return known.size;
  let fit = size;
  const host = field.parentElement;
  if (host && size > 0) {
    // the clone is the same kind of control under the same rules, so its text is drawn as the field's is
    const clone = field.cloneNode(false);
    clone.removeAttribute('id');
    clone.removeAttribute('aria-label');
    clone.setAttribute('aria-hidden', 'true');
    clone.tabIndex = -1;
    clone.readOnly = true;
    if (clone.tagName === 'TEXTAREA') clone.wrap = 'off';
    clone.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;min-width:0;min-height:0;max-width:none;flex:none;' +
      'box-sizing:content-box;padding:0;border:0;margin:0;overflow:hidden;white-space:pre;visibility:hidden;pointer-events:none';
    clone.value = PROBE;
    const block = document.createElement('div');
    block.style.cssText = 'position:absolute;top:0;left:0;white-space:pre;visibility:hidden;pointer-events:none';
    for (const p of FONT) block.style[p] = cs[p];
    block.textContent = PROBE;
    host.append(clone, block);
    // Layout widths (whole pixels, one in ~2000 here), not client rects: a card or popover measured as it
    // scales in would read as narrower. The clone has no padding and never fits its text, so it scrolls.
    const inField = clone.scrollWidth;
    if (inField > 0) {
      // a scaled font need not scale the text linearly (Chrome's autosizing eases large sizes), so measure again
      for (let i = 0; i < 4; i++) {
        const ratio = block.offsetWidth / inField;
        if (Math.abs(ratio - 1) < 0.002) break;
        fit /= ratio;
        block.style.fontSize = fit + 'px';
      }
    }
    clone.remove();
    block.remove();
    if (!(fit > 0) || Math.abs(fit - size) < size * 0.002) fit = size;
  }
  fitted.set(field, { key, size: fit });
  return fit;
}

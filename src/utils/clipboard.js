// the copy of the image, only on https (or localhost), the blob is a promise,
// so the clipboard is written while the click is still the action of the
// user (as Safari needs), the image is made later, see utils/export.js
export const canCopy = () => typeof ClipboardItem != 'undefined' && Boolean(globalThis.navigator?.clipboard?.write);

export const copyImage = blob => navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);

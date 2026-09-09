// Clipboard-supplied URLs never become network requests, even without CSP.
// SVG and arbitrary blob URLs are excluded because their provenance is unknown.
export function localPreviewImageSource(source: string | null | undefined): string | undefined {
  return source && /^data:image\/(?:png|jpeg|gif|webp|bmp|avif);base64,/i.test(source)
    ? source
    : undefined;
}

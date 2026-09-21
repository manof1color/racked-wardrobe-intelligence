/**
 * The only kind of URL a local preview may use.
 *
 * A preview thumbnail comes from `URL.createObjectURL`, which the browser mints for a file the
 * person chose — but the value still travels from a file input into an image source, and a URL
 * arriving there deserves a barrier rather than trust. Only the browser's own `blob:` scheme passes;
 * anything else (a `javascript:` or `data:` string that reached this path some other way) is
 * dropped, and the caller renders no image.
 */
export function blobPreviewUrl(url: string | undefined | null) {
  return typeof url === "string" && url.startsWith("blob:") ? url : undefined;
}

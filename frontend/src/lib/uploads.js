export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export function uploadError(file) {
  if (!file) return "Choose a photo or PDF first.";
  if (!file.size) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) {
    return "That file is over 8 MB. Export a smaller photo or PDF.";
  }
  const namedOk = /\.(jpe?g|png|gif|webp|heic|heif|pdf)$/i.test(file.name);
  const typedOk = !file.type || file.type.startsWith("image/") || file.type === "application/pdf";
  if (!typedOk && !namedOk) {
    return "Upload a photo (JPEG, PNG, WebP, GIF, HEIC) or a PDF.";
  }
  return "";
}

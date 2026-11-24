/**
 * Shrinks a photo in the browser before it is uploaded: longest side 1600 px, JPEG at 82%.
 * A 4 MB phone photo becomes roughly 250-400 KB, which keeps uploads fast on mobile data
 * and lets the free database hold well over a thousand photos.
 */
export async function resizeImage(file: File, maxSize = 1600, quality = 0.82): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    // Respects the photo's rotation from the camera (EXIF orientation) in current browsers.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`"${file.name}" can't be read. Use a JPEG or PNG photo.`);
  }

  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser can't process photos.");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process the photo."))), "image/jpeg", quality),
  );
}

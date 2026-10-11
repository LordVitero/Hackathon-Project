export type Photo = { blob: Blob; url: string; width: number; height: number; dispose: () => void };
export async function preparePhoto(file: Blob): Promise<Photo> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  if (!file.size || file.size > 12 * 1024 * 1024) throw new Error("Choose a nonempty photo under 12 MB.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw new Error("Couldn’t read this photo. Please choose another image."); }
  try {
    const canvas = document.createElement("canvas");
    // Resize the full image to the model's input size without cropping.
    canvas.width = 960;
    canvas.height = 960;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser couldn’t prepare the photo.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await canvasBlob(canvas);
    const url = URL.createObjectURL(blob);
    return { blob, url, width: canvas.width, height: canvas.height, dispose: () => URL.revokeObjectURL(url) };
  } finally { bitmap.close(); }
}
export function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Couldn’t save this photo. Try another image.")), "image/jpeg", .92));
}
export async function capturePhoto(video: HTMLVideoElement) {
  if (!video.videoWidth || video.readyState < 2) throw new Error("The camera isn’t ready yet. Wait a moment and try again.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext("2d")!.drawImage(video, 0, 0);
  return canvasBlob(canvas);
}

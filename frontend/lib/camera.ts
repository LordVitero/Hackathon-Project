export class Camera {
  generation = 0;
  stream: MediaStream | null = null;
  video: HTMLVideoElement;
  media: MediaDevices | undefined;
  constructor(video: HTMLVideoElement, media: MediaDevices | undefined) { this.video = video; this.media = media; }
  stop() {
    this.generation++;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null; this.video.srcObject = null;
  }
  async open() {
    this.stop();
    const generation = this.generation;
    if (!this.media?.getUserMedia) throw new Error("Camera access is unavailable. Upload a photo instead, or open the app on HTTPS or localhost.");
    try {
      const stream = await this.media.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return false; }
      this.stream = stream; this.video.srcObject = stream;
      await this.video.play();
      return generation === this.generation;
    } catch (error) {
      if (generation !== this.generation) return false;
      this.stop();
      const name = (error as Error).name;
      throw new Error(name === "NotAllowedError" ? "Camera permission was denied. Upload a photo instead." :
        name === "NotFoundError" ? "No camera was found. Upload a photo instead." :
        name === "NotReadableError" ? "The camera is busy. Close other camera apps or upload a photo instead." :
        "Couldn’t open the camera. Upload a photo instead.");
    }
  }
}

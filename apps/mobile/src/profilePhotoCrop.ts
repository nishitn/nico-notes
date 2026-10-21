export type PhotoSize = { width: number; height: number };
export type PhotoTransform = { scale: number; x: number; y: number };

export type SquareCrop = { originX: number; originY: number; width: number; height: number };

export function fitCropPhoto(image: PhotoSize, frame: number): PhotoSize {
  const ratio = frame / Math.min(image.width, image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampCropTransform(
  transform: PhotoTransform,
  image: PhotoSize,
  frame: number,
): PhotoTransform {
  const scale = Math.max(1, Math.min(4, transform.scale));
  const fitted = fitCropPhoto(image, frame);
  const maxX = Math.max(0, (fitted.width * scale - frame) / 2);
  const maxY = Math.max(0, (fitted.height * scale - frame) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, transform.x)),
    y: Math.max(-maxY, Math.min(maxY, transform.y)),
  };
}

// Focal points are measured relative to the fixed frame's center.
export function pinchCropPhoto(
  start: PhotoTransform,
  startFocal: { x: number; y: number },
  focal: { x: number; y: number },
  ratio: number,
  image: PhotoSize,
  frame: number,
): PhotoTransform {
  const scale = Math.max(1, Math.min(4, start.scale * ratio));
  const relativeScale = scale / start.scale;
  return clampCropTransform(
    {
      scale,
      x: focal.x - (startFocal.x - start.x) * relativeScale,
      y: focal.y - (startFocal.y - start.y) * relativeScale,
    },
    image,
    frame,
  );
}

export function profilePhotoCrop(
  image: PhotoSize,
  frame: number,
  transform: PhotoTransform,
): SquareCrop {
  const fitted = clampCropTransform(transform, image, frame);
  const ratio = (frame / Math.min(image.width, image.height)) * fitted.scale;
  const side = Math.max(
    1,
    Math.min(Math.min(image.width, image.height), Math.round(frame / ratio)),
  );
  return {
    originX: Math.max(
      0,
      Math.min(image.width - side, Math.round((image.width - side) / 2 - fitted.x / ratio)),
    ),
    originY: Math.max(
      0,
      Math.min(image.height - side, Math.round((image.height - side) / 2 - fitted.y / ratio)),
    ),
    width: side,
    height: side,
  };
}

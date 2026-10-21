export type PhotoSize = { width: number; height: number };
export type PhotoTransform = { scale: number; x: number; y: number };
export type PhotoTap = { time: number; x: number; y: number };

export function isPhotoDoubleTap(previous: PhotoTap | null, current: PhotoTap) {
  return (
    !!previous &&
    current.time - previous.time <= 320 &&
    Math.hypot(current.x - previous.x, current.y - previous.y) <= 28
  );
}

export function fitPhoto(image: PhotoSize, viewport: PhotoSize): PhotoSize {
  'worklet';
  const ratio = Math.min(viewport.width / image.width, viewport.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

export function clampPhotoTransform(
  transform: PhotoTransform,
  image: PhotoSize,
  viewport: PhotoSize,
): PhotoTransform {
  'worklet';
  const scale = Math.max(1, Math.min(4, transform.scale));
  const fitted = fitPhoto(image, viewport);
  const maxX = Math.max(0, (fitted.width * scale - viewport.width) / 2);
  const maxY = Math.max(0, (fitted.height * scale - viewport.height) / 2);
  return {
    scale,
    x: Math.max(-maxX, Math.min(maxX, transform.x)),
    y: Math.max(-maxY, Math.min(maxY, transform.y)),
  };
}

export function pinchPhoto(
  start: PhotoTransform,
  startFocal: { x: number; y: number },
  focal: { x: number; y: number },
  ratio: number,
  image: PhotoSize,
  viewport: PhotoSize,
): PhotoTransform {
  'worklet';
  const scale = Math.max(1, Math.min(4, start.scale * ratio));
  const relativeScale = scale / start.scale;
  return clampPhotoTransform(
    {
      scale,
      x:
        focal.x -
        viewport.width / 2 -
        (startFocal.x - viewport.width / 2 - start.x) * relativeScale,
      y:
        focal.y -
        viewport.height / 2 -
        (startFocal.y - viewport.height / 2 - start.y) * relativeScale,
    },
    image,
    viewport,
  );
}

export function doubleTapPhoto(
  transform: PhotoTransform,
  point: { x: number; y: number },
  image: PhotoSize,
  viewport: PhotoSize,
): PhotoTransform {
  if (transform.scale > 1.01) return { scale: 1, x: 0, y: 0 };
  return pinchPhoto(transform, point, point, 1.75, image, viewport);
}

export function photoSwipeAction(
  direction: 'horizontal' | 'vertical',
  distance: number,
  velocity: number,
  width: number,
): 'previous' | 'next' | 'close' | 'reset' {
  'worklet';
  if (direction === 'vertical')
    return distance > 100 || (distance > 20 && velocity > 750) ? 'close' : 'reset';
  if (Math.abs(distance) > width * 0.2 || (Math.abs(distance) > 20 && Math.abs(velocity) > 500))
    return distance < 0 ? 'next' : 'previous';
  return 'reset';
}

export function visiblePhotoIndex(photos: { _id: string }[], id: string, previousIndex: number) {
  const index = photos.findIndex((photo) => photo._id === id);
  return index >= 0 ? index : Math.min(Math.max(0, previousIndex), photos.length - 1);
}

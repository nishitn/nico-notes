import { describe, expect, it } from 'vite-plus/test';
import {
  clampPhotoTransform,
  doubleTapPhoto,
  fitPhoto,
  isPhotoDoubleTap,
  photoSwipeAction,
  pinchPhoto,
  visiblePhotoIndex,
} from './photoViewerGeometry';

const viewport = { width: 400, height: 800 };
const portrait = { width: 800, height: 1600 };

describe('photo fitting and pinch zoom', () => {
  it('double taps zoom in around the touch point and return a zoomed photo to its original fit', () => {
    const zoomed = doubleTapPhoto({ scale: 1, x: 0, y: 0 }, { x: 100, y: 400 }, portrait, viewport);
    expect(zoomed).toEqual({ scale: 1.75, x: 75, y: 0 });
    expect(doubleTapPhoto(zoomed, { x: 100, y: 400 }, portrait, viewport)).toEqual({
      scale: 1,
      x: 0,
      y: 0,
    });
    expect(
      doubleTapPhoto({ scale: 3, x: 80, y: 100 }, { x: 300, y: 600 }, portrait, viewport),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });
  it('fits portrait and landscape photos without cropping or stretching', () => {
    expect(fitPhoto(portrait, viewport)).toEqual(viewport);
    expect(fitPhoto({ width: 1600, height: 900 }, viewport)).toEqual({ width: 400, height: 225 });
  });

  it('keeps the photo point under the pinch focus while zooming and moving fingers', () => {
    const start = { scale: 1, x: 0, y: 0 };
    expect(
      pinchPhoto(start, { x: 100, y: 400 }, { x: 100, y: 400 }, 2, portrait, viewport),
    ).toEqual({ scale: 2, x: 100, y: 0 });
    expect(
      pinchPhoto(start, { x: 100, y: 400 }, { x: 150, y: 400 }, 2, portrait, viewport),
    ).toEqual({ scale: 2, x: 150, y: 0 });
  });

  it('uses the displayed image dimensions to constrain panning', () => {
    expect(
      clampPhotoTransform({ scale: 2, x: 1000, y: -1000 }, { width: 400, height: 1600 }, viewport),
    ).toEqual({ scale: 2, x: 0, y: -400 });
    expect(
      clampPhotoTransform({ scale: 2, x: -1000, y: 1000 }, { width: 1600, height: 900 }, viewport),
    ).toEqual({ scale: 2, x: -200, y: 0 });
  });

  it('returns the photo to its fitted position when pinched back to its original size', () => {
    expect(
      pinchPhoto(
        { scale: 2, x: 100, y: 200 },
        { x: 100, y: 300 },
        { x: 100, y: 300 },
        0.1,
        portrait,
        viewport,
      ),
    ).toEqual({ scale: 1, x: 0, y: 0 });
    expect(clampPhotoTransform({ scale: 10, x: 0, y: 0 }, portrait, viewport).scale).toBe(4);
  });
});

describe('photo navigation', () => {
  it('recognizes a quick double tap in one place without treating distant or slow taps as a reset', () => {
    const tap = { x: 100, y: 200, time: 1000 };
    expect(isPhotoDoubleTap(tap, { x: 105, y: 205, time: 1200 })).toBe(true);
    expect(isPhotoDoubleTap(tap, { x: 105, y: 205, time: 1500 })).toBe(false);
    expect(isPhotoDoubleTap(tap, { x: 250, y: 205, time: 1200 })).toBe(false);
    expect(isPhotoDoubleTap(null, tap)).toBe(false);
  });
  it('pages horizontally and dismisses only deliberate downward gestures', () => {
    expect(photoSwipeAction('horizontal', -100, 0, 400)).toBe('next');
    expect(photoSwipeAction('horizontal', 100, 0, 400)).toBe('previous');
    expect(photoSwipeAction('horizontal', -30, -800, 400)).toBe('next');
    expect(photoSwipeAction('horizontal', 10, 0, 400)).toBe('reset');
    expect(photoSwipeAction('vertical', 120, 0, 400)).toBe('close');
    expect(photoSwipeAction('vertical', 30, 900, 400)).toBe('close');
    expect(photoSwipeAction('vertical', -150, -1000, 400)).toBe('reset');
    expect(photoSwipeAction('vertical', 15, 900, 400)).toBe('reset');
  });

  it('keeps the current photo when earlier photos disappear and selects a neighbour after deletion', () => {
    const photos = [{ _id: 'a' }, { _id: 'b' }, { _id: 'c' }];
    expect(visiblePhotoIndex(photos.slice(1), 'c', 2)).toBe(1);
    expect(visiblePhotoIndex(photos.slice(0, 2), 'c', 2)).toBe(1);
    expect(visiblePhotoIndex([photos[0], photos[2]], 'b', 1)).toBe(1);
    expect(visiblePhotoIndex([], 'a', 0)).toBe(-1);
  });
});

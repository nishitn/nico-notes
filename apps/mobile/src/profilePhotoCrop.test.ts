import { describe, expect, it } from 'vite-plus/test';
import {
  clampCropTransform,
  fitCropPhoto,
  pinchCropPhoto,
  profilePhotoCrop,
} from './profilePhotoCrop';

const centered = { scale: 1, x: 0, y: 0 };

describe('fixed square profile photo crop', () => {
  it('fills the frame and starts with the center square for portrait and landscape photos', () => {
    expect(fitCropPhoto({ width: 1200, height: 800 }, 300)).toEqual({ width: 450, height: 300 });
    expect(fitCropPhoto({ width: 800, height: 1200 }, 300)).toEqual({ width: 300, height: 450 });
    expect(profilePhotoCrop({ width: 1200, height: 800 }, 300, centered)).toEqual({
      originX: 200,
      originY: 0,
      width: 800,
      height: 800,
    });
    expect(profilePhotoCrop({ width: 800, height: 1200 }, 300, centered)).toEqual({
      originX: 0,
      originY: 200,
      width: 800,
      height: 800,
    });
  });

  it('moves the saved crop in the opposite direction to the dragged photo', () => {
    expect(profilePhotoCrop({ width: 1200, height: 800 }, 300, { scale: 1, x: 75, y: 0 })).toEqual({
      originX: 0,
      originY: 0,
      width: 800,
      height: 800,
    });
    expect(profilePhotoCrop({ width: 800, height: 1200 }, 300, { scale: 1, x: 0, y: -75 })).toEqual(
      { originX: 0, originY: 400, width: 800, height: 800 },
    );
  });

  it('saves exactly the square shown after zooming and dragging', () => {
    expect(
      profilePhotoCrop({ width: 1200, height: 800 }, 300, { scale: 2, x: 60, y: -90 }),
    ).toEqual({ originX: 320, originY: 320, width: 400, height: 400 });
    expect(
      profilePhotoCrop({ width: 1200, height: 800 }, 150, { scale: 2, x: 30, y: -45 }),
    ).toEqual({ originX: 320, originY: 320, width: 400, height: 400 });
  });

  it('keeps every edge covered and bounds rounded crop pixels within the original photo', () => {
    for (const image of [
      { width: 4031, height: 3023 },
      { width: 5, height: 9 },
      { width: 1, height: 1 },
    ]) {
      for (const scale of [0.1, 1, 1.33, 2, 4, 10]) {
        for (const offset of [-10000, -32, 0, 32, 10000]) {
          const transform = clampCropTransform({ scale, x: offset, y: -offset }, image, 333);
          const fitted = fitCropPhoto(image, 333);
          expect(
            (fitted.width * transform.scale) / 2 - Math.abs(transform.x),
          ).toBeGreaterThanOrEqual(333 / 2 - 1e-8);
          expect(
            (fitted.height * transform.scale) / 2 - Math.abs(transform.y),
          ).toBeGreaterThanOrEqual(333 / 2 - 1e-8);
          const crop = profilePhotoCrop(image, 333, transform);
          expect(crop.width).toBe(crop.height);
          expect(crop.width).toBeGreaterThanOrEqual(1);
          expect(crop.originX).toBeGreaterThanOrEqual(0);
          expect(crop.originY).toBeGreaterThanOrEqual(0);
          expect(crop.originX + crop.width).toBeLessThanOrEqual(image.width);
          expect(crop.originY + crop.height).toBeLessThanOrEqual(image.height);
          expect(Object.values(crop).every(Number.isInteger)).toBe(true);
        }
      }
    }
  });

  it('zooms around the fingers and lets the pinch center move without moving the frame', () => {
    const image = { width: 1200, height: 800 };
    expect(pinchCropPhoto(centered, { x: -50, y: 0 }, { x: -50, y: 0 }, 2, image, 300)).toEqual({
      scale: 2,
      x: 50,
      y: 0,
    });
    expect(pinchCropPhoto(centered, { x: -50, y: 0 }, { x: -20, y: 20 }, 2, image, 300)).toEqual({
      scale: 2,
      x: 80,
      y: 20,
    });
    expect(
      pinchCropPhoto({ scale: 2, x: 80, y: 20 }, { x: 0, y: 0 }, { x: 0, y: 0 }, 0.01, image, 300),
    ).toEqual({ scale: 1, x: 40, y: 0 });
  });
});

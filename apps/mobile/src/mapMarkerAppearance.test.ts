import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { URL } from 'node:url';
import { describe, expect, it } from 'vite-plus/test';
import { mapMarkerAppearance, type MapMarkerSymbol } from './mapMarkerAppearance';

const asset = (name: string, density = 1) =>
  readFileSync(
    new URL(
      `../assets/map-markers/${name}${density === 1 ? '' : `@${density}x`}.png`,
      import.meta.url,
    ),
  );

function pixel(png: Buffer, x: number, y: number) {
  const width = png.readUInt32BE(16);
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      const rows = inflateSync(png.subarray(offset + 8, offset + 8 + length));
      const start = y * (width * 4 + 1) + 1 + x * 4;
      return [...rows.subarray(start, start + 4)];
    }
    offset += length + 12;
  }
  throw new Error('No PNG image data');
}

describe('native marker textures', () => {
  it('changes the native image in both zoom directions without changing marker identity', () => {
    const sequence = [30, 23, 17, 8, 17, 23, 30].map(
      (size) => mapMarkerAppearance(size, false).asset,
    );
    expect(sequence).toEqual([
      'heart-30',
      'heart-24',
      'dot-16',
      'dot-8',
      'dot-16',
      'heart-24',
      'heart-30',
    ]);
  });

  it.each(['heart', 'bookmark', 'compass'] as const)(
    'restores the plain %s image after closing selection at any zoom',
    (symbol) => {
      for (const size of [8, 16, 24, 30]) {
        const plain = mapMarkerAppearance(size, false, symbol);
        expect(mapMarkerAppearance(size, true, symbol).asset).toBe(`${symbol}-selected`);
        expect(mapMarkerAppearance(size, false, symbol)).toEqual(plain);
      }
    },
  );

  it('bundles correctly sized PNGs for every appearance at every screen density', () => {
    const appearances = new Map<string, number>();
    for (const symbol of ['heart', 'bookmark', 'compass'] satisfies MapMarkerSymbol[]) {
      for (const size of [8, 12, 16, 20, 24, 30]) {
        for (const selected of [false, true]) {
          const appearance = mapMarkerAppearance(size, selected, symbol);
          appearances.set(appearance.asset, selected ? 40 : appearance.diameter + 4);
        }
      }
    }
    for (const [name, canvas] of appearances) {
      for (const density of [1, 2, 3]) {
        const png = asset(name, density);
        expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
        expect(png.readUInt32BE(16)).toBe(canvas * density);
        expect(png.readUInt32BE(20)).toBe(canvas * density);
      }
    }
  });

  it('keeps the selection fill and halo out of the normal pin image', () => {
    expect(pixel(asset('heart-selected'), 20, 20)).toEqual([255, 253, 249, 255]);
    expect(pixel(asset('heart-30'), 17, 17)).toEqual([163, 62, 39, 255]);
    expect(pixel(asset('heart-selected'), 2, 20)[3]).toBeGreaterThan(0);
    expect(pixel(asset('heart-30'), 0, 17)[3]).toBe(0);
  });

  it('keeps wishlist markers teal at every dot size and when selected', () => {
    const teal = [15, 118, 110, 255];
    for (const size of [8, 12, 16, 20]) {
      const appearance = mapMarkerAppearance(size, false, 'bookmark');
      expect(appearance.asset).toBe(`wishlist-dot-${size}`);
      const center = (size + 4) / 2;
      expect(pixel(asset(appearance.asset), center, center)).toEqual(teal);
      expect(mapMarkerAppearance(size, true, 'bookmark').asset).toBe('bookmark-selected');
    }
    expect(pixel(asset('bookmark-30'), 17, 13)).toEqual(teal);
    expect(pixel(asset('bookmark-selected'), 10, 20)).toEqual(teal);
    expect(pixel(asset('bookmark-selected'), 2, 20).slice(0, 3)).toEqual(teal.slice(0, 3));
  });
});

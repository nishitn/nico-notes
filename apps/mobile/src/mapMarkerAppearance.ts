export type MapMarkerSymbol = 'heart' | 'bookmark' | 'compass';
const sizes = [8, 12, 16, 20, 24, 30] as const;

export function mapMarkerAppearance(
  diameter: number,
  selected: boolean,
  symbol: MapMarkerSymbol = 'heart',
) {
  if (selected) return { asset: `${symbol}-selected`, diameter: 30 };
  const size = sizes.reduce((nearest, next) =>
    Math.abs(next - diameter) < Math.abs(nearest - diameter) ? next : nearest,
  );
  const shape = size < 24 ? (symbol === 'bookmark' ? 'wishlist-dot' : 'dot') : symbol;
  return { asset: `${shape}-${size}`, diameter: size };
}

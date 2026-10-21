export type AttributionPart = { text: string; href?: string; bold?: boolean; italic?: boolean };
function decode(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (all, entity: string) => {
    if (entity.startsWith('#')) {
      const point =
        entity[1].toLowerCase() === 'x'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10);
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : all;
    }
    return (
      (
        { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' } as Record<
          string,
          string
        >
      )[entity.toLowerCase()] ?? all
    );
  });
}
/** Render provider HTML as safe text/links, retaining inline emphasis and line breaks. */
export function attributionParts(html: string): AttributionPart[] {
  const parts: AttributionPart[] = [];
  let href: string | undefined;
  let bold = false;
  let italic = false;
  for (const token of html.match(/<[^>]*>|[^<]+/g) ?? []) {
    if (!token.startsWith('<')) {
      parts.push({ text: decode(token), href, bold, italic });
      continue;
    }
    if (/^<a\s/i.test(token)) {
      const raw = token.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
      try {
        const url = new URL(decode(raw ?? ''));
        href = url.protocol === 'https:' ? url.href : undefined;
      } catch {
        href = undefined;
      }
    } else if (/^<\/a\s*>/i.test(token)) href = undefined;
    else if (/^<(b|strong)(\s|>)/i.test(token)) bold = true;
    else if (/^<\/(b|strong)>/i.test(token)) bold = false;
    else if (/^<(i|em)(\s|>)/i.test(token)) italic = true;
    else if (/^<\/(i|em)>/i.test(token)) italic = false;
    else if (/^<br\s*\/?\s*>/i.test(token)) parts.push({ text: '\n' });
  }
  return parts;
}

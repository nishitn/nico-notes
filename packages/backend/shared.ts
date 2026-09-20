export const MAX_PHOTOS = 10;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_MEMBERS = 20;
export const MAX_ITEMS = 50;
export const INVITE_LIFETIME = 7 * 24 * 60 * 60 * 1000;

export function validScore(score: number) {
  return Number.isFinite(score) && score >= 1 && score <= 10 && Number.isInteger(score * 2);
}
export function average(scores: number[]) {
  return scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null;
}
export function textValue(value: string, label: string, max = 120) {
  const clean = value.trim();
  if (!clean || clean.length > max)
    throw new Error(`${label} must be between 1 and ${max} characters.`);
  return clean;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

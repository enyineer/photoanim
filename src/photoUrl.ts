/**
 * Resolve the photo texture URL: a `?photo=<url>` query parameter wins,
 * otherwise the bundled default print. No upload UI by design.
 */
import defaultPhoto from './assets/default-photo.svg';

export function resolvePhotoUrl(search: string = window.location.search): string {
  const param = new URLSearchParams(search).get('photo');
  if (!param) return defaultPhoto;
  try {
    const url = new URL(param, window.location.href);
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'data:') {
      return url.href;
    }
  } catch {
    // fall through to default on malformed URLs
  }
  return defaultPhoto;
}

export const DEFAULT_PHOTO_URL: string = defaultPhoto;

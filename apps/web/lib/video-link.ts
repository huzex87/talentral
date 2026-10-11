import { videoEmbedUrl } from '@talentral/domain';

export type VideoLinkCheck =
  | { state: 'empty' }
  | { state: 'ok'; embed: string; vimeo: boolean }
  | { state: 'problem'; message: string };

// What we can tell from the link alone, before it is saved. Hubs use unlisted YouTube for now:
// an unlisted Vimeo link carries a private code Talentral does not keep, so it would not play.
export function checkVideoLink(raw: string): VideoLinkCheck {
  const value = raw.trim();
  if (!value) return { state: 'empty' };
  let url: URL | null = null;
  try { url = new URL(value); } catch { /* not a link */ }
  const host = url?.hostname.replace(/^www\.|^m\./, '') ?? '';
  if (host === 'studio.youtube.com') {
    return { state: 'problem', message: 'This is a YouTube Studio link, which only you can open. Open the video, tap Share, then Copy link, and paste that here.' };
  }
  if (url && /(^|\.)vimeo\.com$/.test(host) && (/\/\d{6,12}\/[0-9a-f]{6,}/i.test(url.pathname) || url.searchParams.has('h'))) {
    return { state: 'problem', message: 'This Vimeo video is unlisted, and unlisted Vimeo videos cannot play in Talentral yet. Upload it to YouTube as Unlisted instead and paste that link.' };
  }
  const embed = videoEmbedUrl(value);
  if (embed) return { state: 'ok', embed, vimeo: embed.includes('vimeo') };
  if (url && url.protocol !== 'https:') return { state: 'problem', message: 'Use the full link starting with https://, as YouTube gives it under Share.' };
  return { state: 'problem', message: 'This is not a YouTube or Vimeo video link we can play. On the video, tap Share, then Copy link, and paste it here.' };
}

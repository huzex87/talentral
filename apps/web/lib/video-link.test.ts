import { describe, expect, it } from 'vitest';
import { checkVideoLink } from './video-link';

describe('checking a lesson video link as a hub pastes it', () => {
  it('accepts the YouTube links people copy from Share', () => {
    for (const link of ['https://youtu.be/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'https://youtube.com/shorts/dQw4w9WgXcQ', 'https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=10s']) {
      expect(checkVideoLink(link)).toEqual({ state: 'ok', embed: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', vimeo: false });
    }
  });
  it('accepts a public Vimeo video', () => {
    expect(checkVideoLink('https://vimeo.com/76979871')).toMatchObject({ state: 'ok', vimeo: true });
  });
  it('explains what to do instead for links that would not play', () => {
    expect(checkVideoLink('https://studio.youtube.com/video/dQw4w9WgXcQ/edit')).toMatchObject({ state: 'problem', message: expect.stringContaining('Copy link') });
    expect(checkVideoLink('https://vimeo.com/76979871/a1b2c3d4e5')).toMatchObject({ state: 'problem', message: expect.stringContaining('Unlisted') });
    expect(checkVideoLink('https://player.vimeo.com/video/76979871?h=a1b2c3d4e5')).toMatchObject({ state: 'problem' });
    expect(checkVideoLink('http://youtu.be/dQw4w9WgXcQ')).toMatchObject({ state: 'problem', message: expect.stringContaining('https://') });
    expect(checkVideoLink('my lesson video')).toMatchObject({ state: 'problem' });
  });
  it('says nothing while the box is empty', () => {
    expect(checkVideoLink('  ')).toEqual({ state: 'empty' });
  });
});

import { describe, expect, it } from 'vitest';
import { formatBytes, pick, renderLessonText, trueFalseOptions, validateQuestion, videoEmbedUrl } from '../src';

describe('video links', () => {
  it('embeds YouTube and Vimeo privately and refuses anything else', () => {
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('https://vimeo.com/123456789')).toBe('https://player.vimeo.com/video/123456789?dnt=1');
    expect(videoEmbedUrl('http://youtube.com/watch?v=dQw4w9WgXcQ')).toBeNull();
    expect(videoEmbedUrl('https://evil.example/embed/x')).toBeNull();
    expect(videoEmbedUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('lesson text', () => {
  it('formats simple writing and escapes everything else', () => {
    const html = renderLessonText('# Tags\n\nHTML is **structure**, CSS is *style*.\n\n- <p> paragraphs\n- `div` blocks\n\n1. Open\n2. Save\n\n[MDN](https://developer.mozilla.org)\n\n<script>alert(1)</script>');
    expect(html).toContain('<h2>Tags</h2>');
    expect(html).toContain('<strong>structure</strong>');
    expect(html).toContain('<em>style</em>');
    expect(html).toContain('<ul><li>&lt;p&gt; paragraphs</li><li><code>div</code> blocks</li></ul>');
    expect(html).toContain('<ol><li>Open</li><li>Save</li></ol>');
    expect(html).toContain('<a href="https://developer.mozilla.org" target="_blank" rel="noopener noreferrer nofollow">MDN</a>');
    expect(html).not.toContain('<script>');
    expect(renderLessonText('[x](javascript:alert(1))')).not.toContain('href');
    expect(renderLessonText('```\n<b>kept</b>\n```')).toBe('<pre><code>&lt;b&gt;kept&lt;/b&gt;</code></pre>');
  });
});

describe('quiz questions', () => {
  const base = { kind: 'single' as const, prompt: 'HTML stands for?', options: [{ id: 'a', text: 'HyperText' }, { id: 'b', text: 'Hi' }], correct: ['a'], points: 1 };
  it('need a prompt, two answers and the right number of correct ones', () => {
    expect(validateQuestion(base)).toBeNull();
    expect(validateQuestion({ ...base, correct: [] })).toBe('Mark the right answer.');
    expect(validateQuestion({ ...base, correct: ['a', 'b'] })).toBe('Mark exactly one right answer.');
    expect(validateQuestion({ ...base, kind: 'multiple', correct: ['a', 'b'] })).toBeNull();
    expect(validateQuestion({ ...base, options: [{ id: 'a', text: 'Only' }] })).toBe('Give at least two answers.');
    expect(validateQuestion({ ...base, kind: 'true_false', options: trueFalseOptions(), correct: ['true'] })).toBeNull();
  });
});

describe('languages', () => {
  it('falls back to English with a flag', () => {
    expect(pick('Hello', 'Sannu', 'ha')).toEqual({ text: 'Sannu', fallback: false });
    expect(pick('Hello', '', 'ha')).toEqual({ text: 'Hello', fallback: true });
    expect(pick('Hello', 'Sannu', 'en')).toEqual({ text: 'Hello', fallback: false });
    expect(formatBytes(2_500_000)).toBe('2.4 MB');
  });
});

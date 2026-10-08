/**
 * Markdown → HTML for model answers.
 *
 * An answer is untrusted text: the model can be steered by anything it reads,
 * including a web page, PDF or note the user indexed. Rendered as-is, an answer
 * containing `![x](https://host/?d=…)` or raw `<img>` / `<iframe>` makes the
 * popup load that URL, which would send data off the device and break the
 * "no requests except model downloads" promise. So:
 *   - raw HTML is shown as text, never parsed
 *   - images are shown as their alt text and never loaded
 *   - links render only for http(s) and mailto, open in a new tab, and carry
 *     no referrer
 * The extension CSP (manifest.json) blocks other origins as a second layer.
 */

import { Marked, type Tokens } from 'marked';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const SAFE_LINK = /^(https?:|mailto:)/i;

const marked = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
    image({ text }: Tokens.Image): string {
      return escapeHtml(text);
    },
    link({ href, title, tokens }: Tokens.Link): string {
      const label = this.parser.parseInline(tokens);
      if (!SAFE_LINK.test(href.trim())) return label;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`;
    },
  },
});

export function markdownToHtml(text: string): string {
  return marked.parse(text, { async: false }) as string;
}

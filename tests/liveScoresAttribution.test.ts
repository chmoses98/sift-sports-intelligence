// SportScore's free tier has one condition (https://sportscore.com/developers/terms/ §2): a real, visible, crawlable, dofollow link to
// https://sportscore.com/ on every page that uses its data, not hidden by CSS and not behind a client-only render that bots do not run.
// SIFT is a React app, so the link exists twice: in the static page (what a crawler that runs no script reads) and in the app where scores show.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf-8');
const anchors = [...html.matchAll(/<a\b[^>]*href="https:\/\/sportscore\.com\/"[^>]*>[^<]*<\/a>/g)].map((m) => m[0]);

describe('the SportScore credit is in the static page, not only behind a script', () => {
  it('index.html carries a plain, followable "Powered by SportScore" link, inside the root, outside noscript and comments', () => {
    expect(anchors).toHaveLength(1);
    const a = anchors[0];
    expect(a).toMatch(/rel="dofollow"/);
    expect(a).not.toMatch(/nofollow|ugc|sponsored|noindex/i);
    expect(a).toMatch(/>Powered by SportScore<\/a>/);
    expect(a).toMatch(/title="Sports data by SportScore"/);
    const rootStart = html.indexOf('<div id="root">');
    const rootEnd = html.indexOf('</div>', rootStart);
    expect(html.indexOf(a)).toBeGreaterThan(rootStart);
    expect(html.indexOf(a)).toBeLessThan(rootEnd);
    // not hidden in any way the terms rule out
    const para = html.slice(html.lastIndexOf('<p', html.indexOf(a)), html.indexOf('</p>', html.indexOf(a)));
    expect(para).not.toMatch(/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0|font-size\s*:\s*0|hidden/i);
    expect(html.slice(0, html.indexOf(a)).split('<!--').length).toBe(html.slice(0, html.indexOf(a)).split('-->').length); // not inside a comment
  });
  it('robots do not block the page the link is on', () => {
    let robots = '';
    try { robots = readFileSync(join(__dirname, '..', 'public', 'robots.txt'), 'utf-8'); } catch { /* no robots.txt: nothing is blocked */ }
    expect(robots).not.toMatch(/^\s*Disallow:\s*\/\s*$/im);
  });
});

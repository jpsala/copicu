/// <reference path="./copicu-action.d.ts" />

/** Accept a whole video URL, never arbitrary text containing a link. */
export function youtubeVideoId(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) {
    return null;
  }
  let id: string | null = null;
  if (url.hostname === 'youtu.be') {
    id = /^\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  } else if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname)) {
    id = url.pathname === '/watch'
      ? url.searchParams.get('v')
      : /^\/(?:shorts|live|embed)\/([^/]+)\/?$/.exec(url.pathname)?.[1] ?? null;
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

export async function fetchYoutubeTitle(id: string): Promise<string> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid YouTube video ID');
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`);
  endpoint.searchParams.set('format', 'json');
  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(5000),
      redirect: 'error',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error();
    const data = await response.json();
    const title = typeof data?.title === 'string' ? data.title.trim() : '';
    if (!title || title.length > 2000 || /[\x00-\x1f\x7f]/.test(title)) throw new Error();
    return title;
  } catch {
    // Never expose the video URL, title or response body in diagnostics.
    throw new Error('YouTube title lookup failed (network, timeout or unavailable video)');
  }
}

export default defineAction({
  id: 'examples.youtubeTitleClipboardChange',
  title: 'YouTube video title',
  description: 'On capture, sends only the YouTube video ID to YouTube oEmbed and fills an empty title. Leaves clipboard content unchanged.',
  triggers: ['clipboardChange'],
  input: { source: 'clipboard', selection: 'none', kinds: ['text'] },
  capabilities: ['history:read-content', 'history:write-metadata'],
  async run(ctx) {
    // Use the captured item ID, not the current picker selection or live clipboard.
    const itemId = ctx.currentItemId;
    if (!itemId) return;
    const item = await copicu.history.get(itemId, { content: true });
    if (item.kind !== 'text' || item.title?.trim()) return;
    const id = youtubeVideoId(item.text ?? '');
    if (!id) return;
    const title = await fetchYoutubeTitle(id);
    // Re-read after the network wait: respect edits/deletion while fetching.
    const latest = await copicu.history.get(itemId, { content: true });
    if (latest.title?.trim() || latest.kind !== 'text' || latest.text !== item.text) return;
    await copicu.history.update(itemId, { title });
  },
});

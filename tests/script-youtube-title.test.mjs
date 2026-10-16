import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await fs.readFile('scripts/examples/037-youtube-title-clipboard-change.ts', 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});

test('YouTube title script (synthetic, no network or clipboard)', async (t) => {
  const originalFetch = globalThis.fetch;
  const originalDefine = globalThis.defineAction;
  const originalCopicu = globalThis.copicu;
  const updates = [];
  let item;
  let reads;
  let onFetch;
  let requests;
  let response;
  globalThis.defineAction = (action) => action;
  globalThis.copicu = { history: {
    async get(id) { assert.equal(id, '42'); reads++; return { ...item }; },
    async update(id, patch) { updates.push({ id, patch }); Object.assign(item, patch); },
  } };
  globalThis.fetch = async (url, options) => {
    requests++;
    const endpoint = new URL(url);
    assert.equal(endpoint.origin + endpoint.pathname, 'https://www.youtube.com/oembed');
    assert.equal(endpoint.searchParams.get('url'), 'https://www.youtube.com/watch?v=Abcdef_12-3');
    assert.equal(endpoint.searchParams.get('format'), 'json');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.ok(options.signal instanceof AbortSignal);
    if (onFetch) await onFetch();
    return response;
  };
  try {
    const module = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
    const action = module.default;
    function reset() {
      item = { id: '42', kind: 'text', text: 'https://youtu.be/Abcdef_12-3?si=private-tracking', tags: ['keep'], notes: 'Keep notes' };
      reads = requests = 0;
      updates.length = 0;
      onFetch = null;
      response = { ok: true, json: async () => ({ title: '  Synthetic video & title  ' }) };
    }
    await t.test('recognizes video URL variants only on exact allowed hosts', () => {
      for (const url of [
        ' https://youtu.be/Abcdef_12-3?t=42 ',
        'https://www.youtube.com/watch?v=Abcdef_12-3&list=anything',
        'https://m.youtube.com/shorts/Abcdef_12-3',
        'https://music.youtube.com/watch?v=Abcdef_12-3',
        'https://youtube.com/live/Abcdef_12-3',
        'https://www.youtube.com/embed/Abcdef_12-3',
      ]) assert.equal(module.youtubeVideoId(url), 'Abcdef_12-3', url);
      for (const url of [
        'https://youtube.com.evil.test/watch?v=Abcdef_12-3',
        'https://evil.test/youtu.be/Abcdef_12-3',
        'https://youtube.com/playlist?list=Abcdef_12-3',
        'https://youtu.be/short', 'https://youtu.be/Abcdef_12-3/extra',
        'https://user:pass@youtube.com/watch?v=Abcdef_12-3',
        'https://youtube.com:8080/watch?v=Abcdef_12-3',
        'file://youtube.com/watch?v=Abcdef_12-3',
        'Look at https://youtu.be/Abcdef_12-3',
      ]) assert.equal(module.youtubeVideoId(url), null, url);
    });
    await t.test('fills title only; a recapture with title makes no request', async () => {
      reset();
      const before = { ...item };
      await action.run({ currentItemId: '42', activeItemId: '999' });
      assert.deepEqual(updates, [{ id: '42', patch: { title: 'Synthetic video & title' } }]);
      assert.deepEqual(item, { ...before, title: 'Synthetic video & title' });
      assert.equal(reads, 2);
      await action.run({ currentItemId: '42' });
      assert.equal(requests, 1);
    });
    await t.test('skips absent capture, non-video, image and existing title', async () => {
      reset();
      await action.run({ activeItemId: '999' });
      assert.equal(reads, 0);
      for (const patch of [{ title: 'My title' }, { text: 'plain text' }, { kind: 'image' }]) {
        reset(); Object.assign(item, patch);
        await action.run({ currentItemId: '42' });
        assert.equal(requests, 0); assert.equal(updates.length, 0);
      }
    });
    await t.test('respects title or content edits during fetch', async () => {
      for (const patch of [{ title: 'Manual title' }, { text: 'Edited content' }]) {
        reset(); onFetch = () => Object.assign(item, patch);
        await action.run({ currentItemId: '42' });
        assert.equal(updates.length, 0);
      }
    });
    await t.test('lookup errors are sanitized and never mutate metadata', async () => {
      for (const bad of [
        { ok: false },
        { ok: true, json: async () => { throw new Error('private response'); } },
        { ok: true, json: async () => ({ title: '' }) },
        { ok: true, json: async () => ({ title: 123 }) },
        { ok: true, json: async () => ({ title: 'bad\ncontrol' }) },
      ]) {
        reset(); response = bad;
        await assert.rejects(action.run({ currentItemId: '42' }), /^Error: YouTube title lookup failed/);
        assert.equal(updates.length, 0);
      }
      reset(); onFetch = () => { throw new DOMException('private URL', 'TimeoutError'); };
      await assert.rejects(action.run({ currentItemId: '42' }), /^Error: YouTube title lookup failed/);
      assert.equal(updates.length, 0);
    });
    await t.test('invalid ID never goes to network', async () => {
      reset();
      await assert.rejects(module.fetchYoutubeTitle('invalid'));
      assert.equal(requests, 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.defineAction = originalDefine;
    globalThis.copicu = originalCopicu;
  }
});

// Durable person-scoped control feed. Called inside the mutation transaction;
// streams are only wakeups and never carry catalog metadata or key packages.
import { randomBytes } from 'node:crypto';

export function createEvents({ query, transaction, environment, identity, deny, counter, be64, from64, clock, maxEvents = 1024, maxAgeMs = 86400000n }) {
  query('CREATE TABLE IF NOT EXISTS control_feed_meta(generation TEXT NOT NULL) STRICT').run();
  if (!query('SELECT generation FROM control_feed_meta').get()) query('INSERT INTO control_feed_meta VALUES (?)').run(randomBytes(16).toString('hex'));
  const generation = query('SELECT generation FROM control_feed_meta').get().generation;
  query('CREATE TABLE IF NOT EXISTS control_feed_heads(person TEXT PRIMARY KEY,head BLOB NOT NULL) STRICT').run();
  query('CREATE TABLE IF NOT EXISTS control_events(person TEXT NOT NULL,sequence BLOB NOT NULL,created BLOB NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(person,sequence)) STRICT').run();
  const listeners = new Set();
  let stopped = false;
  function audience(resource) {
    return new Set(query(`SELECT owner AS person FROM control_resources WHERE id=? AND deleted=0
      UNION SELECT m.person FROM control_members m JOIN control_resources r ON r.id=m.resource WHERE m.resource=? AND m.revoked=0 AND r.deleted=0
      UNION SELECT i.person FROM control_invites i JOIN control_resources r ON r.id=i.resource WHERE i.resource=? AND i.state IN ('open','accepted') AND i.expires>? AND r.deleted=0`).all(resource, resource, resource, be64(clock())).map(r => r.person));
  }
  function head(person) { return from64(query('SELECT head FROM control_feed_heads WHERE person=?').get(person)?.head ?? be64(0n)); }
  function publicationAudience(resource) {
    return new Set(query(`SELECT DISTINCT cd.person FROM relay_grants g
      JOIN relay_devices d ON d.id=g.device JOIN control_devices cd ON cd.device=d.id
      JOIN relay_channels c ON c.id=g.channel JOIN control_resources r ON r.id=g.channel
      JOIN control_members m ON m.resource=r.id AND m.person=cd.person
      WHERE g.channel=? AND g.can_read=1 AND g.key_epoch=c.key_epoch
        AND d.revoked=0 AND m.revoked=0 AND r.deleted=0`).all(resource).map(r => r.person));
  }
  function publication(resource, head) {
    append(publicationAudience(resource), { type: 'publication_head_changed', resourceId: resource, head: head.toString() });
  }
  function watermark(device) {
    const person = identity(device).id;
    return { version: 1, environment, personId: person, generation, cursor: head(person).toString() };
  }
  function append(people, value) {
    for (const person of people) {
      const next = head(person) + 1n;
      if (next > (1n << 64n) - 1n) deny(409, 'control_cursor_exhausted');
      query('INSERT INTO control_feed_heads VALUES (?,?) ON CONFLICT(person) DO UPDATE SET head=excluded.head').run(person, be64(next));
      query('INSERT INTO control_events VALUES (?,?,?,?)').run(person, be64(next), be64(clock()), JSON.stringify({ version: 1, ...value, cursor: next.toString() }));
      const cutoff = clock() > maxAgeMs ? clock() - maxAgeMs : 0n;
      query('DELETE FROM control_events WHERE person=? AND (sequence<=? OR created<?)').run(person, be64(next > BigInt(maxEvents) ? next - BigInt(maxEvents) : 0n), be64(cutoff));
    }
  }
  function mutation(resource, before, operationId, deviceId) {
    const after = audience(resource);
    const revision = String(query('SELECT revision FROM control_resources WHERE id=?').get(resource)?.revision ?? '0');
    for (const person of new Set([...before, ...after])) append([person], after.has(person)
      ? { type: 'catalog_changed', resourceId: resource, revision, operationId, deviceId }
      : { type: 'resource_removed', resourceId: resource });
  }
  function deviceChanged(device) {
    if (!query('SELECT 1 FROM control_devices WHERE device=?').get(device)) return;
    const person = identity(device).id;
    const people = new Set([person]);
    for (const row of query(`SELECT r.owner FROM control_resources r WHERE r.deleted=0 AND
      (EXISTS(SELECT 1 FROM control_members m WHERE m.resource=r.id AND m.person=? AND m.revoked=0)
       OR EXISTS(SELECT 1 FROM control_invites i WHERE i.resource=r.id AND i.person=? AND i.state IN ('open','accepted')))` ).all(person, person)) people.add(row.owner);
    append(people, { type: 'devices_changed' });
  }
  function changes(device, url) {
    return transaction(() => {
      const person = identity(device).id;
      if (url.searchParams.get('personId') !== person) deny(400, 'control_cursor_scope');
      const revoked = query('SELECT revoked FROM relay_devices WHERE id=?').get(device);
      if (!revoked || revoked.revoked) deny(401, 'unauthorized');
      const cutoff = clock() > maxAgeMs ? clock() - maxAgeMs : 0n;
      query('DELETE FROM control_events WHERE person=? AND created<?').run(person, be64(cutoff));
      const cursor = counter(url.searchParams.get('cursor') ?? '0', true);
      const limit = counter(url.searchParams.get('limit') ?? '64');
      if (limit > 64n) deny(400, 'invalid_limit');
      const top = head(person);
      const first = query('SELECT sequence FROM control_events WHERE person=? ORDER BY sequence LIMIT 1').get(person);
      const floor = first ? from64(first.sequence) : top + 1n;
      const reset = url.searchParams.get('generation') !== generation || cursor > top;
      const gap = cursor < floor - 1n;
      const rows = reset || gap ? [] : query('SELECT payload FROM control_events WHERE person=? AND sequence>? ORDER BY sequence LIMIT ?').all(person, be64(cursor), Number(limit));
      const events = rows.map(row => {
        const event = JSON.parse(row.payload);
        // Replay after a revocation cannot expose old revisions/correlation.
        const current = event.resourceId && (event.type === 'publication_head_changed' ? publicationAudience(event.resourceId) : audience(event.resourceId));
        return event.resourceId && !current.has(person)
          ? { version: 1, type: 'resource_removed', resourceId: event.resourceId, cursor: event.cursor } : event;
      });
      const next = events.at(-1)?.cursor ?? cursor.toString();
      return { ...watermark(device), head: top.toString(), floor: floor.toString(), next, reset, gap, events };
    })();
  }
  function wake() { for (const listener of [...listeners]) listener.drain(); }
  function stream(device, url, request) {
    if (listeners.size >= 64 || [...listeners].filter(l => l.device === device).length >= 1) deny(429, 'stream_capacity');
    const last = request.headers.get('last-event-id');
    if (last) {
      const match = /^([a-f0-9]{32}):([A-Za-z0-9_-]{1,128}):([0-9]{1,20})$/.exec(last);
      if (!match) deny(400, 'invalid_cursor');
      url.searchParams.set('generation', match[1]); url.searchParams.set('personId', match[2]); url.searchParams.set('cursor', match[3]);
    }
    changes(device, url); // validate before committing HTTP headers
    const initialPerson = identity(device).id;
    const encoder = new TextEncoder();
    let close;
    const body = new ReadableStream({
      start(controller) {
        let done = false, heartbeat;
        const listener = { device, drain };
        close = () => {
          if (done) return; done = true; listeners.delete(listener); clearInterval(heartbeat);
          request.signal.removeEventListener('abort', close);
          try { controller.close(); } catch {}
        };
        function send(value) {
          const bytes = encoder.encode(value);
          if ((controller.desiredSize ?? 0) < bytes.byteLength) { close(); return false; }
          controller.enqueue(bytes); return true;
        }
        function drain() {
          if (done) return;
          if (stopped) { close(); return; }
          try {
            let page = changes(device, url);
            if (page.reset || page.gap) { send(`event: reset\ndata: ${JSON.stringify({ version: 1, generation, reset: page.reset, gap: page.gap })}\n\n`); close(); return; }
            do {
              for (const event of page.events) {
                if (!send(`id: ${generation}:${initialPerson}:${event.cursor}\nevent: control\ndata: ${JSON.stringify(event)}\n\n`)) return;
                url.searchParams.set('cursor', event.cursor);
              }
              if (page.next === page.head || !page.events.length) break;
              page = changes(device, url);
            } while (!done);
          } catch { close(); }
        }
        // Register before the first drain: any commit after the snapshot is in
        // durable replay; JS synchronous DB scopes make replay -> live gapless.
        listeners.add(listener);
        request.signal.addEventListener('abort', close, { once: true });
        send(': connected\n\n');
        heartbeat = setInterval(() => { drain(); if (!done) send(': heartbeat\n\n'); }, 3000);
        heartbeat.unref?.();
        drain();
        if (request.signal.aborted) close();
      }, cancel() { close?.(); },
    }, { highWaterMark: 65536, size: chunk => chunk.byteLength });
    return new Response(body, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'connection': 'keep-alive', 'x-accel-buffering': 'no', 'x-content-type-options': 'nosniff' } });
  }
  function stop() { stopped = true; wake(); }
  return { audience, watermark, mutation, deviceChanged, publication, changes, stream, wake, stop, append };
}

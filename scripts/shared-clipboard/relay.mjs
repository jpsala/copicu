// Local relay for owned synthetic profiles. Provisioning is an explicit constructor
// input, never an HTTP enrollment or an assertion supplied by a desktop client.
import { Database } from "bun:sqlite";
import { createHash, createPublicKey, randomBytes, sign, timingSafeEqual, verify } from "node:crypto";
import { createControl } from './control.mjs';
import { createIdentity } from './identity.mjs';
export { controlSigningBytes } from './control.mjs';

export const MAX_BODY = 36 * 1024 * 1024;
export const MAX_CIPHERTEXT = 25 * 1024 * 1024 + 16 * 1024;
// Local fixture candidates, not production capacity claims. Reducing a limit
// rejects new records; it never evicts identities, receipts or retained rows.
export const DEFAULT_LIMITS = Object.freeze({ publicationsPerChannel: 4096, payloadBytesPerChannel: 64 * 1024 * 1024, pendingLeases: 1024, reportsPerChannel: 16384, devices: 256, grants: 4096, controlEventsPerPerson: 1024 });
const U64_MAX = (1n << 64n) - 1n;
const PUB_DOMAIN = Buffer.from("Copicu.shared.publication.v1\0");
const LEASE_DOMAIN = Buffer.from("Copicu.shared.lease.v1\0");
const REPORT_DOMAIN = Buffer.from("Copicu.shared.report.v1\0");
const SPKI_ED25519 = Buffer.from("302a300506032b6570032100", "hex");
// Compressed EIGHT_TORSION points from curve25519-dalek 5.0.0. Mask the sign
// bit so non-canonical x=0 sign variants are rejected too, matching host guards.
const WEAK_Y = new Set([
  '0100000000000000000000000000000000000000000000000000000000000000',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
]);
const DAY = 86_400_000n;
const LEASE_DURATION = 10_000n;
const hash = (bytes) => createHash("sha256").update(bytes).digest();
class Denied extends Error {
  constructor(status, code) { super(code); this.status = status; this.code = code; }
}
const deny = (status, code) => { throw new Denied(status, code); };
function opaque(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) deny(400, "invalid_id");
  return value;
}
function counter(value, zero = false) {
  if (typeof value !== "string" || !(zero ? /^(0|[1-9][0-9]{0,19})$/ : /^[1-9][0-9]{0,19}$/).test(value)) deny(400, "invalid_counter");
  const result = BigInt(value);
  if (result > U64_MAX) deny(400, "counter_overflow");
  return result;
}
const be64 = (value) => { const result = Buffer.alloc(8); result.writeBigUInt64BE(value); return result; };
const from64 = (value) => Buffer.from(value).readBigUInt64BE();
const frame = (value) => { const bytes = Buffer.from(value); const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length); return Buffer.concat([size, bytes]); };
function keys(value, expected) {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== expected.length || expected.some((key) => !Object.hasOwn(value, key))) deny(400, "invalid_fields");
}
function base64(value, min, max = min) {
  if (typeof value !== "string" || value.length > MAX_BODY) deny(400, "invalid_base64");
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.length < min || bytes.length > max) deny(400, "invalid_base64");
  return bytes;
}
function strictJson(text) {
  let result;
  try { result = JSON.parse(text); } catch { deny(400, "invalid_json"); }
  // JSON.parse accepts duplicate keys; the Rust typed wire format does not.
  // Scan string tokens after parsing so escaped braces/colons are never syntax.
  const stack = [];
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === "{" || char === "[") {
      stack.push(char === "{" ? new Set() : null);
      if (stack.length > 16) deny(400, "invalid_json");
    } else if (char === "}" || char === "]") stack.pop();
    else if (char === '"') {
      const start = index++;
      for (; index < text.length; index++) {
        if (text[index] === "\\") index++;
        else if (text[index] === '"') break;
      }
      let next = index + 1;
      while (/\s/.test(text[next] ?? "") && next < text.length) next++;
      if (text[next] === ":") {
        const key = JSON.parse(text.slice(start, index + 1));
        const seen = stack.at(-1);
        if (!seen || seen.has(key)) deny(400, "duplicate_fields");
        seen.add(key);
      }
    }
  }
  return result;
}
function envelope(value) {
  keys(value, ["version", "environment", "channel_id", "publication_id", "device_id", "origin_ordinal", "key_epoch", "expires_at_unix_ms", "freshness", "nonce", "ciphertext", "signature"]);
  if (value.version !== 1) deny(400, "unsupported_version");
  for (const field of ["environment", "channel_id", "publication_id", "device_id"]) opaque(value[field]);
  for (const field of ["origin_ordinal", "key_epoch", "expires_at_unix_ms"]) counter(value[field]);
  if (value.freshness?.kind === "deferred") keys(value.freshness, ["kind"]);
  else if (value.freshness?.kind === "live") { keys(value.freshness, ["kind", "lease_id"]); opaque(value.freshness.lease_id); }
  else deny(400, "invalid_freshness");
  base64(value.nonce, 24); base64(value.ciphertext, 16, MAX_CIPHERTEXT); base64(value.signature, 64);
  // Rebuild in schema order: JSON field ordering is not part of the signed wire.
  return Object.fromEntries(["version", "environment", "channel_id", "publication_id", "device_id", "origin_ordinal", "key_epoch", "expires_at_unix_ms", "freshness", "nonce", "ciphertext", "signature"].map((key) => [key, key === "freshness" ? value.freshness.kind === "live" ? { kind: "live", lease_id: value.freshness.lease_id } : { kind: "deferred" } : value[key]]));
}
export function publicationSigningBytes(value) {
  const bytes = [PUB_DOMAIN, Buffer.from([1])];
  for (const key of ["environment", "channel_id", "publication_id", "device_id"]) bytes.push(frame(opaque(value[key])));
  for (const key of ["origin_ordinal", "key_epoch", "expires_at_unix_ms"]) bytes.push(be64(counter(value[key])));
  if (value.freshness.kind === "deferred") bytes.push(Buffer.from([0]));
  else bytes.push(Buffer.from([1]), frame(opaque(value.freshness.lease_id)));
  bytes.push(frame(base64(value.nonce, 24)), frame(base64(value.ciphertext, 16, MAX_CIPHERTEXT)));
  return Buffer.concat(bytes);
}
export function leaseSigningBytes(proof) {
  return Buffer.concat([LEASE_DOMAIN, ...["lease_id", "environment", "channel_id", "device_id"].map((key) => frame(opaque(proof[key]))), ...["issued_at_unix_ms", "expires_at_unix_ms", "max_duration_ms"].map((key) => be64(counter(proof[key])))]);
}
export function reportSigningBytes(environment, channel, device, report) {
  return Buffer.concat([REPORT_DOMAIN, ...[environment, channel, device, report.attempt_id, report.publication_id, report.sink, report.outcome].map((value) => frame(opaque(value)))]);
}
function publicKey(raw) {
  const bytes = typeof raw === "string" ? base64(raw, 32) : Buffer.from(raw);
  if (bytes.length !== 32) deny(400, "invalid_public_key");
  const canonical = Buffer.from(bytes); canonical[31] &= 127;
  let y = 0n; for (let i=31;i>=0;i--) y=(y<<8n)|BigInt(canonical[i]);
  if (y >= (1n<<255n)-19n || WEAK_Y.has(canonical.toString('hex'))) deny(400,'invalid_public_key');
  return createPublicKey({ key: Buffer.concat([SPKI_ED25519, bytes]), format: "der", type: "spki" });
}
async function body(request) {
  const length = request.headers.get("content-length");
  if (length !== null && (!/^[0-9]+$/.test(length) || BigInt(length) > BigInt(MAX_BODY))) deny(413, "body_too_large");
  if (!request.body) deny(400, "invalid_json");
  const reader = request.body.getReader(); const chunks = []; let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > MAX_BODY) { await reader.cancel(); deny(413, "body_too_large"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return strictJson(Buffer.concat(chunks).toString("utf8"));
}
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" } });

/** devices: [{id,token,public_key,grants:[{channel_id,key_epoch,publish,read,report}]}]
 * channels: [{id,key_epoch}]. leaseSigner: Ed25519 private KeyObject.
 * dbPath belongs to a newly-created fixture directory (same path for restart).
 * This constructor is a local owner's provisioning surface, not enrollment.
 */
export function createRelay({ dbPath, environment, devices = [], channels = [], persons = [], leaseSigner, custodyKey = null, now = () => BigInt(Date.now()), faults = {}, limits: overrides = {}, identity: identityOptions = null, port = 0 }) {
  opaque(environment);
  if (!leaseSigner || leaseSigner.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 lease signer required");
  if (!overrides || typeof overrides !== "object" || Array.isArray(overrides) || Object.keys(overrides).some((key) => !Object.hasOwn(DEFAULT_LIMITS, key))) throw new Error("invalid relay limits");
  const limits = { ...DEFAULT_LIMITS, ...overrides };
  if (Object.values(limits).some((limit) => !Number.isSafeInteger(limit) || limit < 1)) throw new Error("invalid relay limits");
  const issuerPublicKey = createPublicKey(leaseSigner).export({ type: "spki", format: "der" }).subarray(-32);
  const db = new Database(dbPath, { create: true, strict: true });
  // Explicit statement ownership avoids retaining a SQLite cursor across the
  // owner epoch mutation on Bun 1.3. Each operation finalizes its own statement.
  const query = (sql) => Object.fromEntries(["get", "all", "run"].map((method) => [method, (...args) => {
    const statement = db.prepare(sql);
    try { return statement[method](...args); } finally { statement.finalize(); }
  }]));
  // Explicit synchronous transaction scope also gives shutdown ownership of all
  // statements on the installed Bun runtime; no callback may perform async I/O.
  const transaction = (operation) => () => {
    db.run("BEGIN IMMEDIATE");
    try { const value = operation(); db.run("COMMIT"); return value; }
    catch (error) { if (db.inTransaction) db.run("ROLLBACK"); throw error; }
  };
  db.run("PRAGMA journal_mode=WAL"); db.run("PRAGMA foreign_keys=ON");
  db.run(`CREATE TABLE IF NOT EXISTS relay_meta(environment TEXT PRIMARY KEY,issuer_public_key BLOB NOT NULL CHECK(length(issuer_public_key)=32)) STRICT;
    CREATE TABLE IF NOT EXISTS relay_devices(id TEXT PRIMARY KEY,token_hash BLOB NOT NULL,public_key BLOB NOT NULL,revoked INTEGER NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE IF NOT EXISTS relay_channels(id TEXT PRIMARY KEY,key_epoch BLOB NOT NULL,head BLOB NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS relay_grants(device TEXT NOT NULL REFERENCES relay_devices(id),channel TEXT NOT NULL REFERENCES relay_channels(id),key_epoch BLOB NOT NULL,can_publish INTEGER NOT NULL,can_read INTEGER NOT NULL,can_report INTEGER NOT NULL,PRIMARY KEY(device,channel)) STRICT;
    CREATE TABLE IF NOT EXISTS relay_ordinals(device TEXT NOT NULL,channel TEXT NOT NULL,last BLOB NOT NULL,PRIMARY KEY(device,channel)) STRICT;
    CREATE TABLE IF NOT EXISTS relay_leases(id TEXT PRIMARY KEY,device TEXT NOT NULL,channel TEXT NOT NULL,expires BLOB NOT NULL,proof TEXT NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS relay_publications(id TEXT PRIMARY KEY,channel TEXT NOT NULL,device TEXT NOT NULL,sequence BLOB NOT NULL,ordinal BLOB NOT NULL,accepted BLOB NOT NULL,expires BLOB NOT NULL,digest BLOB NOT NULL,envelope TEXT,lease_proof TEXT,UNIQUE(channel,sequence)) STRICT;
    CREATE TABLE IF NOT EXISTS relay_reports(device TEXT NOT NULL,channel TEXT NOT NULL,id TEXT NOT NULL,digest BLOB NOT NULL,publication TEXT NOT NULL,sink TEXT NOT NULL,outcome TEXT NOT NULL,PRIMARY KEY(device,channel,id)) STRICT;`);
  const keyCache = new Map();
  try {
    transaction(() => {
      const prior = query("SELECT environment,issuer_public_key FROM relay_meta").get();
      if (prior && prior.environment !== environment) throw new Error("environment mismatch");
      if (prior && !timingSafeEqual(Buffer.from(prior.issuer_public_key), issuerPublicKey)) throw new Error("issuer identity mismatch");
      query("INSERT OR IGNORE INTO relay_meta(environment,issuer_public_key) VALUES (?,?)").run(environment, issuerPublicKey);
      for (const channel of channels) query("INSERT OR IGNORE INTO relay_channels VALUES (?,?,?)").run(opaque(channel.id), be64(counter(channel.key_epoch)), be64(0n));
      for (const device of devices) {
        opaque(device.id);
        if (typeof device.token !== "string" || device.token.length < 32 || device.token.length > 512) throw new Error("synthetic bearer must have at least 32 characters");
        const raw = typeof device.public_key === "string" ? base64(device.public_key, 32) : Buffer.from(device.public_key);
        keyCache.set(device.id, publicKey(raw));
        const tokenHash = hash(device.token);
        const existing = query("SELECT token_hash,public_key FROM relay_devices WHERE id=?").get(device.id);
        if (existing && (!timingSafeEqual(Buffer.from(existing.token_hash), tokenHash) || !Buffer.from(existing.public_key).equals(raw))) throw new Error("provisioned identity mismatch");
        if (!existing && query("SELECT count(*) AS count FROM relay_devices").get().count >= limits.devices) deny(429, "device_capacity");
        query("INSERT OR IGNORE INTO relay_devices(id,token_hash,public_key) VALUES (?,?,?)").run(device.id, tokenHash, raw);
        for (const grant of device.grants ?? []) {
          opaque(grant.channel_id);
          const existingGrant = query("SELECT 1 AS present FROM relay_grants WHERE device=? AND channel=?").get(device.id, grant.channel_id);
          if (!existingGrant && query("SELECT count(*) AS count FROM relay_grants").get().count >= limits.grants) deny(429, "grant_capacity");
          query("INSERT OR IGNORE INTO relay_grants VALUES (?,?,?,?,?,?)").run(device.id, grant.channel_id, be64(counter(grant.key_epoch)), grant.publish === true ? 1 : 0, grant.read === true ? 1 : 0, grant.report === true ? 1 : 0);
        }
      }
    })();
  } catch (error) { db.close(); throw error; }
  const waiters = new Set(); let stopped = false; let control = null; let identity = null;
  function clock() { const value = now(); if (typeof value !== "bigint" || value <= 0n || value > U64_MAX) throw new Error("invalid fixture clock"); return value; }
  function auth(request) {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ") || header.length > 519) deny(401, "unauthorized");
    const digest = hash(header.slice(7)); let found;
    for (const device of query("SELECT id,token_hash,revoked,public_key FROM relay_devices").all()) if (timingSafeEqual(Buffer.from(device.token_hash), digest)) found = device;
    if (!found || found.revoked) deny(401, "unauthorized");
    if (!keyCache.has(found.id)) keyCache.set(found.id, publicKey(found.public_key));
    return found.id;
  }
  function grant(device, channel, permission) {
    const row = query("SELECT g.*,c.head,c.key_epoch AS current_epoch,d.revoked FROM relay_grants g JOIN relay_channels c ON c.id=g.channel JOIN relay_devices d ON d.id=g.device WHERE g.device=? AND g.channel=?").get(device, channel);
    if (!row || row.revoked || !row[`can_${permission}`] || !Buffer.from(row.key_epoch).equals(Buffer.from(row.current_epoch))) deny(403, "forbidden");
    const membership = control?.authorize(device,channel,permission);
    if (membership) row.history_floor = membership.history_floor;
    return row;
  }
  function notify(channel = null) { for (const waiter of [...waiters]) if (!channel || waiter.channel === channel) waiter.finish(); }
  function ack(row) { return { publication_id: row.id, server_sequence: from64(row.sequence).toString(), accepted_at_unix_ms: from64(row.accepted).toString(), expires_at_unix_ms: from64(row.expires).toString() }; }
  function prune(at = clock()) {
    if (typeof at !== "bigint" || at <= 0n || at > U64_MAX) throw new Error("invalid prune clock");
    transaction(() => {
      query("UPDATE relay_publications SET envelope=NULL,lease_proof=NULL WHERE expires<=?").run(be64(at));
      if (at > DAY) query("DELETE FROM relay_publications WHERE expires<=?").run(be64(at - DAY));
      query("DELETE FROM relay_leases WHERE expires<=? AND id NOT IN (SELECT json_extract(envelope,'$.freshness.lease_id') FROM relay_publications WHERE envelope IS NOT NULL AND json_extract(envelope,'$.freshness.kind')='live')").run(be64(at));
      control?.custody?.prune(at);
    })();
  }
  function publish(device, channel, input) {
    const value = envelope(input); const at = clock(); const expiry = counter(value.expires_at_unix_ms);
    const json = JSON.stringify(value); const digest = hash(json);
    prune(at);
    return transaction(() => {
      const allowed = grant(device, channel, "publish");
      if (value.environment !== environment || value.channel_id !== channel || value.device_id !== device) deny(403, "scope_mismatch");
      if (!be64(counter(value.key_epoch)).equals(Buffer.from(allowed.current_epoch))) deny(409, "stale_epoch");
      if (!verify(null, publicationSigningBytes(value), keyCache.get(device), base64(value.signature, 64))) deny(403, "invalid_signature");
      if (expiry <= at || expiry - at > DAY) deny(410, "expired_publication");
      const previous = query("SELECT * FROM relay_publications WHERE id=?").get(value.publication_id);
      if (previous) {
        if (from64(previous.expires) <= at || previous.envelope === null) deny(410, "expired_publication");
        if (previous.channel !== channel || previous.device !== device || !timingSafeEqual(Buffer.from(previous.digest), digest)) deny(409, "publication_conflict");
        return ack(previous); // Idempotency precedes ordinal and lease freshness.
      }
      let leaseProof = null;
      if (value.freshness.kind === "live") {
        const lease = query("SELECT * FROM relay_leases WHERE id=?").get(value.freshness.lease_id);
        if (!lease || lease.device !== device || lease.channel !== channel || from64(lease.expires) <= at) deny(409, "invalid_lease");
        leaseProof = lease.proof;
        const proof = JSON.parse(leaseProof);
        if (counter(proof.issued_at_unix_ms) > at) deny(409, "invalid_lease");
      }
      const ordinal = counter(value.origin_ordinal);
      const priorOrdinal = query("SELECT last FROM relay_ordinals WHERE device=? AND channel=?").get(device, channel);
      if (priorOrdinal && ordinal <= from64(priorOrdinal.last)) deny(409, "ordinal_replay");
      const usage = query("SELECT count(*) AS count,coalesce(sum(length(CAST(envelope AS BLOB))+coalesce(length(CAST(lease_proof AS BLOB)),0)),0) AS bytes FROM relay_publications WHERE channel=?").get(channel);
      if (usage.count >= limits.publicationsPerChannel || usage.bytes + Buffer.byteLength(json) + (leaseProof ? Buffer.byteLength(leaseProof) : 0) > limits.payloadBytesPerChannel) deny(429, "publication_capacity");
      const head = from64(allowed.head); if (head === U64_MAX) deny(409, "sequence_exhausted");
      const sequence = be64(head + 1n);
      query("INSERT INTO relay_publications VALUES (?,?,?,?,?,?,?,?,?,?)").run(value.publication_id, channel, device, sequence, be64(ordinal), be64(at), be64(expiry), digest, json, leaseProof);
      query("INSERT INTO relay_ordinals VALUES (?,?,?) ON CONFLICT(device,channel) DO UPDATE SET last=excluded.last").run(device, channel, be64(ordinal));
      query("UPDATE relay_channels SET head=? WHERE id=?").run(sequence, channel);
      control.events.publication(channel, head + 1n);
      const result = ack({ id: value.publication_id, sequence, accepted: be64(at), expires: be64(expiry) });
      if (faults.beforePublishCommit?.(result)) deny(503, "publication_rollback");
      return result;
    })();
  }
  function sync(device, channel, url) {
    let cursor = counter(url.searchParams.get("cursor") ?? "0", true);
    const limitText = url.searchParams.get("limit") ?? "50";
    const limitValue = counter(limitText); if (limitValue > 50n) deny(400, "invalid_limit");
    prune();
    return transaction(() => {
      const allowed = grant(device, channel, "read"); const head = from64(allowed.head);
      if (cursor > head) deny(409, "future_cursor");
      if (allowed.history_floor && cursor < from64(allowed.history_floor)-1n) cursor=from64(allowed.history_floor)-1n;
      const first = query("SELECT sequence FROM relay_publications WHERE channel=? AND envelope IS NOT NULL ORDER BY sequence LIMIT 1").get(channel);
      const firstSequence = first ? from64(first.sequence) : head === U64_MAX ? head : head + 1n;
      const next = query("SELECT sequence FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND sequence>? ORDER BY sequence LIMIT 1").get(channel, be64(cursor));
      const lostThrough = next ? from64(next.sequence) - 1n : head;
      const gap = cursor < lostThrough ? { first_lost: (cursor + 1n).toString(), last_lost: lostThrough.toString() } : undefined;
      const start = gap ? lostThrough : cursor;
      const result = { environment, channel_id: channel, head: head.toString(), retention_floor: firstSequence.toString(), next_cursor: start.toString(), entries: [], ...(gap ? { gap } : {}) };
      const rows = query("SELECT sequence,envelope,lease_proof FROM relay_publications WHERE channel=? AND envelope IS NOT NULL AND sequence>? ORDER BY sequence LIMIT ?").all(channel, be64(start), Number(limitValue));
      for (const row of rows) {
        // Retention may expire a middle item before its neighbors. Stop at the
        // first hole; the next sync exposes that loss explicitly before advancing.
        if (from64(row.sequence) !== BigInt(result.next_cursor) + 1n) break;
        const entry = { server_sequence: from64(row.sequence).toString(), envelope: JSON.parse(row.envelope), ...(row.lease_proof ? { lease_proof: JSON.parse(row.lease_proof) } : {}) };
        result.entries.push(entry); const oldCursor = result.next_cursor; result.next_cursor = entry.server_sequence;
        if (Buffer.byteLength(JSON.stringify(result)) > MAX_BODY) { result.entries.pop(); result.next_cursor = oldCursor; break; }
      }
      return result;
    })();
  }
  async function watch(device, channel, url, request) {
    const expected = counter(url.searchParams.get("head") ?? "0", true);
    const duration = counter(url.searchParams.get("wait_ms") ?? "10000"); if (duration > 10_000n) deny(400, "invalid_wait");
    let allowed = grant(device, channel, "read"); const current = from64(allowed.head);
    if (expected > current) deny(409, "future_head");
    if (current > expected) return { head: current.toString() };
    if (waiters.size >= 64 || [...waiters].filter((waiter) => waiter.device === device).length >= 4) deny(429, "watch_capacity");
    await new Promise((resolve) => {
      let timer;
      const waiter = { device, channel, finish() { clearTimeout(timer); request.signal.removeEventListener("abort", waiter.finish); waiters.delete(waiter); resolve(); } };
      timer = setTimeout(waiter.finish, Number(duration)); waiters.add(waiter); request.signal.addEventListener("abort", waiter.finish, { once: true });
      if (request.signal.aborted) waiter.finish();
    });
    if (stopped) deny(503, "stopped");
    allowed = grant(device, channel, "read");
    const head = from64(allowed.head).toString();
    return head === expected.toString() ? { head, heartbeat: true } : { head };
  }
  function lease(device, channel, input) {
    keys(input, []); grant(device, channel, "publish");
    const issued = clock(); if (issued > U64_MAX - LEASE_DURATION) deny(409, "clock_exhausted");
    prune(issued);
    const proof = { lease_id: randomBytes(24).toString("hex"), environment, channel_id: channel, device_id: device, issued_at_unix_ms: issued.toString(), expires_at_unix_ms: (issued + LEASE_DURATION).toString(), max_duration_ms: LEASE_DURATION.toString() };
    proof.signature = sign(null, leaseSigningBytes(proof), leaseSigner).toString("base64");
    return transaction(() => {
      grant(device, channel, "publish");
      if (query("SELECT count(*) AS count FROM relay_leases WHERE expires>?").get(be64(issued)).count >= limits.pendingLeases) deny(429, "lease_capacity");
      query("INSERT INTO relay_leases VALUES (?,?,?,?,?)").run(proof.lease_id, device, channel, be64(issued + LEASE_DURATION), JSON.stringify(proof));
      return proof;
    })();
  }
  function report(device, channel, value) {
    keys(value, ["attempt_id", "publication_id", "sink", "outcome", "signature"]);
    opaque(value.attempt_id); opaque(value.publication_id);
    if (!["clipboard", "history", "action"].includes(value.sink) || !["applied", "failed", "uncertain", "skipped"].includes(value.outcome)) deny(400, "invalid_report");
    base64(value.signature, 64);
    return transaction(() => {
      grant(device, channel, "report");
      if (!verify(null, reportSigningBytes(environment, channel, device, value), keyCache.get(device), base64(value.signature, 64))) deny(403, "invalid_signature");
      const digest = hash(reportSigningBytes(environment, channel, device, value));
      const previous = query("SELECT digest FROM relay_reports WHERE device=? AND channel=? AND id=?").get(device, channel, value.attempt_id);
      if (previous && !timingSafeEqual(Buffer.from(previous.digest), digest)) deny(409, "report_conflict");
      if (previous) return { attempt_id: value.attempt_id, status: "ack" };
      const publication = query("SELECT channel,sequence FROM relay_publications WHERE id=?").get(value.publication_id);
      if (!publication || publication.channel !== channel) deny(403, "forbidden");
      const allowed=grant(device,channel,'report');
      if (allowed.history_floor && from64(publication.sequence)<from64(allowed.history_floor)) deny(403,'forbidden');
      if (query("SELECT count(*) AS count FROM relay_reports WHERE channel=?").get(channel).count >= limits.reportsPerChannel) deny(429, "report_capacity");
      query("INSERT INTO relay_reports VALUES (?,?,?,?,?,?,?)").run(device, channel, value.attempt_id, digest, value.publication_id, value.sink, value.outcome);
      return { attempt_id: value.attempt_id, status: "ack" };
    })();
  }
  try { control = createControl({query,transaction,environment,persons,devices,channels,deny,opaque,counter,be64,from64,base64,publicKey,clock,notify,limits,maxBody:MAX_BODY,managedIdentity:!!identityOptions,custodyKey,leaseSigner}); }
  catch(error) {db.close(true); throw error;}
  // Keep the outer server cap finite but above the protocol cap so ordinary
  // over-limit requests reach our bounded reader and receive a stable 413.
  const server = Bun.serve({ hostname: "127.0.0.1", port, maxRequestBodySize: MAX_BODY * 2, idleTimeout: 15,
    async fetch(request) {
      try {
        if (stopped) deny(503, "stopped");
        const url = new URL(request.url);
        if (url.pathname === '/health' && request.method === 'GET') return response({status:'ready',version:3});
        const identityResult = await identity?.route(request, url);
        // A shutdown can run while an async identity route yields, including
        // the no-op for V1/V2. Never open a new stream/watch after draining.
        if (stopped) deny(503, "stopped");
        if (identityResult) return identityResult;
        let device = auth(request);
        if (url.pathname === '/v2/catalog' && request.method === 'GET') return response(control.catalog(device));
        if (url.pathname === '/v2/changes' && request.method === 'GET') return response(control.events.changes(device, url));
        if (url.pathname === '/v2/events' && request.method === 'GET') return control.events.stream(device, url, request);
        if (url.pathname === '/v2/operations' && request.method === 'POST') {
          const input=await body(request); device=auth(request);
          if(faults.beforeControl?.(input)) deny(503,'response_unavailable');
          const result=control.operation(device,input);
          if(faults.afterControlCommit?.(result)) deny(503,'response_lost');
          return response(result);
        }
        const historyRoute=/^\/v2\/resources\/([A-Za-z0-9_-]{1,128})\/history$/.exec(url.pathname);
        if(historyRoute && request.method==='GET') {prune(); return response(control.history(device,historyRoute[1],url));}
        const entryRoute=/^\/v2\/resources\/([A-Za-z0-9_-]{1,128})\/history\/([A-Za-z0-9_-]{1,128})$/.exec(url.pathname);
        if(entryRoute && request.method==='GET') {prune(); return response(control.historicalEntry(device,entryRoute[1],entryRoute[2]));}
        if (url.pathname === "/v1/channels" && request.method === "GET") {
          const rows = query("SELECT g.channel AS id,c.key_epoch FROM relay_grants g JOIN relay_channels c ON c.id=g.channel WHERE g.device=? AND g.key_epoch=c.key_epoch AND (g.can_read=1 OR g.can_publish=1) ORDER BY g.channel").all(device);
          return response({ channels: rows.filter(row=>{try {control.authorize(device,row.id,'read'); return true;} catch{return false;}}).map((row) => ({ id: row.id, key_epoch: from64(row.key_epoch).toString() })) });
        }
        const route = /^\/v1\/channels\/([A-Za-z0-9_-]{1,128})\/(publish|sync|watch|lease|report)$/.exec(url.pathname);
        if (!route) deny(404, "not_found");
        const [, channel, method] = route;
        if (["sync", "watch"].includes(method) && request.method === "GET") return response(method === "sync" ? sync(device, channel, url) : await watch(device, channel, url, request));
        if (["publish", "lease", "report"].includes(method) && request.method === "POST") {
          grant(device, channel, method === "report" ? "report" : "publish");
          const input = await body(request); device = auth(request); // Revoke while reading wins.
          const result = method === "publish" ? publish(device, channel, input) : method === "lease" ? lease(device, channel, input) : report(device, channel, input);
          if (method === "publish") { notify(channel); control.events.wake(); if (faults.afterPublishCommit?.(result)) deny(503, "response_lost"); }
          return response(result);
        }
        deny(405, "method_not_allowed");
      } catch (error) { return response({ error: error instanceof Denied ? error.code : "internal_error" }, error instanceof Denied ? error.status : 500); }
    }, error() { return response({ error: "internal_error" }, 500); }
  });
  try {
    if (identityOptions) identity = createIdentity({query,transaction,control,environment,issuerPublicKey:issuerPublicKey.toString('base64'),publicUrl:identityOptions.publicUrl??server.url.toString(),oidc:identityOptions.oidc,deny,opaque,base64,publicKey,body,response,clock,be64,from64,limits,notify,faults:identityOptions.faults});
  } catch (error) { server.stop(true); db.close(true); throw error; }
  return {
    url: server.url.toString().replace(/\/$/, ""),
    issuerPublicKey: issuerPublicKey.toString("base64"),
    revokeDevice(device) { transaction(() => { control.events.deviceChanged(opaque(device)); query("UPDATE relay_devices SET revoked=1 WHERE id=?").run(device); })(); notify(); control.events.wake(); },
    setChannelEpoch(channel, epoch) { transaction(() => { const old = query("SELECT key_epoch FROM relay_channels WHERE id=?").get(opaque(channel)); const value = counter(epoch); if (!old || value <= from64(old.key_epoch)) deny(409, "invalid_epoch_transition"); query("UPDATE relay_channels SET key_epoch=? WHERE id=?").run(be64(value), channel); })(); notify(channel); },
    approveGrant(device, channel, epoch) { transaction(() => { const current = query("SELECT key_epoch FROM relay_channels WHERE id=?").get(opaque(channel)); const value = be64(counter(epoch)); if (!current || !value.equals(Buffer.from(current.key_epoch))) deny(409, "stale_epoch"); query("UPDATE relay_grants SET key_epoch=? WHERE device=? AND channel=?").run(value, opaque(device), channel); })(); notify(channel); },
    prune,
    async stop() {
      if (stopped) return; stopped = true; notify(); control.events.stop();
      // Let closed SSE bodies settle before forcing remaining sockets closed.
      // New/late requests are already fenced by stopped on both sides of await.
      await new Promise(resolve => setTimeout(resolve, 0));
      await server.stop(true); control.custody?.close(); db.clearQueryCache(); db.close(true);
    }
  };
}

import { test, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { generateKeyPairSync, randomBytes, sign, verify } from "node:crypto";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRelay, publicationSigningBytes, leaseSigningBytes, reportSigningBytes, MAX_BODY, MAX_CIPHERTEXT, DEFAULT_LIMITS } from "../scripts/shared-clipboard/relay.mjs";

async function fixture(run, options = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "copicu-relay-synthetic-"));
  const dbPath = path.join(root, "relay.sqlite");
  const sender = generateKeyPairSync("ed25519"), reader = generateKeyPairSync("ed25519"), issuer = generateKeyPairSync("ed25519");
  const tokenA = randomBytes(32).toString("hex"), tokenB = randomBytes(32).toString("hex");
  let time = 2_000_000_000_000n;
  const rawKey = (key) => key.export({ type: "spki", format: "der" }).subarray(-32).toString("base64");
  const config = { dbPath, environment: "synthetic-dev", channels: [{ id: "channel-A", key_epoch: "1" }, { id: "channel-B", key_epoch: "1" }], devices: [
    { id: "device-A", token: tokenA, public_key: rawKey(sender.publicKey), grants: [{ channel_id: "channel-A", key_epoch: "1", publish: true, read: true, report: true }] },
    { id: "device-B", token: tokenB, public_key: rawKey(reader.publicKey), grants: [{ channel_id: "channel-A", key_epoch: "1", publish: false, read: true, report: true }] }
  ], leaseSigner: issuer.privateKey, now: () => time, ...options };
  let relay = createRelay(config);
  const call = async (route, payload, token = tokenA) => {
    const result = await fetch(`${relay.url}${route}`, { method: payload === undefined ? "GET" : "POST", headers: { authorization: `Bearer ${token}`, ...(payload === undefined ? {} : { "content-type": "application/json" }) }, ...(payload === undefined ? {} : { body: typeof payload === "string" ? payload : JSON.stringify(payload) }) });
    const text = await result.text();
    return { status: result.status, value: text ? JSON.parse(text) : null, bytes: Buffer.byteLength(text) };
  };
  const publication = (id = "publication-A", ordinal = "1", changes = {}) => {
    const value = { version: 1, environment: "synthetic-dev", channel_id: "channel-A", publication_id: id, device_id: "device-A", origin_ordinal: ordinal, key_epoch: "1", expires_at_unix_ms: (time + 60_000n).toString(), freshness: { kind: "deferred" }, nonce: randomBytes(24).toString("base64"), ciphertext: randomBytes(32).toString("base64"), ...changes };
    value.signature = sign(null, publicationSigningBytes(value), sender.privateKey).toString("base64");
    return value;
  };
  const context = { call, publication, sender, reader, issuer, tokenA, tokenB, dbPath, config,
    get relay() { return relay; }, get time() { return time; }, advance(delta) { time += BigInt(delta); },
    async restart() { await relay.stop(); relay = createRelay(config); }
  };
  let failure;
  try { await run(context); } catch (error) { failure = error; }
  try { await relay.stop(); } catch (error) { failure ??= error; }
  if (path.dirname(root) !== path.resolve(tmpdir()) || !path.basename(root).startsWith("copicu-relay-synthetic-")) throw new Error("fixture cleanup boundary");
  try { await rm(root, { recursive: true, force: true }); } catch (error) { failure ??= error; }
  if (failure) throw failure;
}
const route = (method, channel = "channel-A") => `/v1/channels/${channel}/${method}`;

test("real HTTP and SQLite preserve immutable publication, retry and restart", async () => fixture(async (f) => {
  const value = f.publication();
  const first = await f.call(route("publish"), value); expect(first.status).toBe(200); expect(first.value.server_sequence).toBe("1");
  expect((await f.call(route("publish"), value)).value).toEqual(first.value);
  const conflict = f.publication("publication-A", "2"); expect((await f.call(route("publish"), conflict)).status).toBe(409);
  await f.restart(); expect((await f.call(route("publish"), value)).value).toEqual(first.value);
  const synced = await f.call(route("sync") + "?cursor=0", undefined, f.tokenB);
  expect(synced.value.entries).toHaveLength(1); expect(synced.value.entries[0].envelope).toEqual(value); expect(synced.value.next_cursor).toBe("1");
  const db = new Database(f.dbPath, { readonly: true });
  const stored = db.query("SELECT typeof(sequence) AS type,length(sequence) AS bytes,envelope FROM relay_publications").get();
  expect(stored.type).toBe("blob"); expect(stored.bytes).toBe(8); expect(JSON.parse(stored.envelope).ciphertext).toBe(value.ciphertext); db.close(true);
}));

test("commit survives absent successful acknowledgement and restart", async () => {
  let drop = true;
  await fixture(async (f) => {
    const value = f.publication(); expect((await f.call(route("publish"), value)).status).toBe(503);
    drop = false; await f.restart();
    expect((await f.call(route("publish"), value)).value.server_sequence).toBe("1");
    expect((await f.call(route("sync") + "?cursor=0")).value.head).toBe("1");
  }, { faults: { afterPublishCommit: () => drop } });
});

test("auth and channel scopes deny ungranted, wrong environment and origin", async () => fixture(async (f) => {
  expect((await f.call("/v1/channels", undefined, "incorrect-bearer")).status).toBe(401);
  expect((await f.call("/v1/channels")).value).toEqual({ channels: [{ id: "channel-A", key_epoch: "1" }] });
  expect((await f.call(route("sync", "channel-B") + "?cursor=0")).status).toBe(403);
  expect((await f.call(route("publish"), f.publication(), f.tokenB)).status).toBe(403);
  expect((await f.call(route("publish"), f.publication("wrong-env", "1", { environment: "other" }))).status).toBe(403);
  expect((await f.call(route("publish"), f.publication("wrong-origin", "1", { device_id: "device-B" }))).status).toBe(403);
  expect((await f.call(route("publish"), f.publication("wrong-channel", "1", { channel_id: "channel-B" }))).status).toBe(403);
  expect((await f.call(route("sync") + "?cursor=0")).value.head).toBe("0");
}));

test("all signed publication routing, epoch, freshness and bytes reject tampering", async () => fixture(async (f) => {
  const value = f.publication();
  const changes = [{ environment: "other" }, { channel_id: "channel-B" }, { device_id: "device-B" }, { publication_id: "changed" }, { origin_ordinal: "2" }, { key_epoch: "2" }, { expires_at_unix_ms: (f.time + 61_000n).toString() }, { freshness: { kind: "live", lease_id: "unknown" } }, { nonce: randomBytes(24).toString("base64") }, { ciphertext: randomBytes(32).toString("base64") }, { signature: randomBytes(64).toString("base64") }];
  for (const change of changes) expect((await f.call(route("publish"), { ...value, ...change })).status).not.toBe(200);
  expect((await f.call(route("sync") + "?cursor=0")).value.head).toBe("0");
}));

test("canonical u64 counters retain full precision and enforce ordinal monotonicity", async () => fixture(async (f) => {
  expect((await f.call(route("publish"), f.publication("high", "9007199254740993"))).status).toBe(200);
  expect((await f.call(route("publish"), f.publication("lower", "9007199254740992"))).status).toBe(409);
  expect((await f.call(route("publish"), f.publication("max", "18446744073709551615"))).status).toBe(200);
  const sync = await f.call(route("sync") + "?cursor=0&limit=1"); expect(sync.value.entries[0].envelope.origin_ordinal).toBe("9007199254740993"); expect(sync.value.next_cursor).toBe("1");
  for (const invalid of ["01", "1e3", "-1", "18446744073709551616"]) expect((await f.call(route("sync") + `?cursor=${invalid}`)).status).toBe(400);
  expect((await f.call(route("sync") + "?cursor=0&limit=51")).status).toBe(400);
}));

test("lease proof is signed, bound, durable and never upgrades deferred", async () => fixture(async (f) => {
  const proof = (await f.call(route("lease"), {})).value;
  expect(proof.max_duration_ms).toBe("10000"); expect(verify(null, leaseSigningBytes(proof), f.issuer.publicKey, Buffer.from(proof.signature, "base64"))).toBe(true);
  expect(verify(null, leaseSigningBytes({ ...proof, device_id: "device-B" }), f.issuer.publicKey, Buffer.from(proof.signature, "base64"))).toBe(false);
  const live = f.publication("live", "1", { freshness: { kind: "live", lease_id: proof.lease_id } });
  expect((await f.call(route("publish"), live)).status).toBe(200);
  f.advance(10_001); expect((await f.call(route("publish"), live)).status).toBe(200); // Immutable accepted retry, no new live admission.
  expect((await f.call(route("publish"), f.publication("late", "2", { freshness: { kind: "live", lease_id: proof.lease_id } }))).status).toBe(409);
  expect((await f.call(route("publish"), f.publication("deferred", "2"))).status).toBe(200);
  await f.restart(); const sync = (await f.call(route("sync") + "?cursor=0")).value;
  expect(sync.entries[0].lease_proof).toEqual(proof); expect(sync.entries[1].envelope.freshness.kind).toBe("deferred"); expect(sync.entries[1].lease_proof).toBeUndefined();
}));

test("expiry leaves explicit empty gap and tombstone, and cannot resurrect after GC", async () => fixture(async (f) => {
  const value = f.publication("short", "1", { expires_at_unix_ms: (f.time + 5n).toString() });
  expect((await f.call(route("publish"), value)).status).toBe(200);
  f.advance(6); f.relay.prune();
  const gap = (await f.call(route("sync") + "?cursor=0")).value;
  expect(gap.entries).toEqual([]); expect(gap.gap).toEqual({ first_lost: "1", last_lost: "1" }); expect(gap.retention_floor).toBe("2"); expect(gap.next_cursor).toBe("1");
  expect((await f.call(route("publish"), value)).status).toBe(410);
  f.advance(86_400_001); f.relay.prune(); expect((await f.call(route("publish"), value)).status).toBe(410);
  expect((await f.call(route("publish"), f.publication("new", "1"))).status).toBe(409);
  expect((await f.call(route("publish"), f.publication("new", "2"))).value.server_sequence).toBe("2");
}));

test("middle retention holes stop contiguous pages and are explicit on next sync", async () => fixture(async (f) => {
  await f.call(route("publish"), f.publication("first", "1"));
  await f.call(route("publish"), f.publication("middle", "2", { expires_at_unix_ms: (f.time + 3n).toString() }));
  await f.call(route("publish"), f.publication("last", "3"));
  f.advance(4); const first = (await f.call(route("sync") + "?cursor=0")).value;
  expect(first.entries.map((entry) => entry.server_sequence)).toEqual(["1"]); expect(first.next_cursor).toBe("1");
  const second = (await f.call(route("sync") + "?cursor=1")).value;
  expect(second.gap).toEqual({ first_lost: "2", last_lost: "2" }); expect(second.entries.map((entry) => entry.server_sequence)).toEqual(["3"]);
}));

test("revocation wakes watch and wins accepted retries, including restart", async () => fixture(async (f) => {
  const value = f.publication(); await f.call(route("publish"), value);
  const pending = f.call(route("watch") + "?head=1&wait_ms=1000", undefined, f.tokenB);
  await new Promise((resolve) => setTimeout(resolve, 20)); f.relay.revokeDevice("device-B");
  expect((await pending).status).toBe(403); expect((await f.call(route("sync") + "?cursor=0", undefined, f.tokenB)).status).toBe(401);
  f.relay.revokeDevice("device-A"); expect((await f.call(route("publish"), value)).status).toBe(401);
  await f.restart(); expect((await f.call("/v1/channels")).status).toBe(401);
}));

test("epoch rotation denies stale grants and old publish, retains recovery bytes", async () => fixture(async (f) => {
  const old = f.publication(); await f.call(route("publish"), old);
  f.relay.setChannelEpoch("channel-A", "2"); expect((await f.call(route("publish"), old)).status).toBe(403);
  f.relay.approveGrant("device-A", "channel-A", "2"); expect((await f.call(route("publish"), old)).status).toBe(409);
  f.relay.approveGrant("device-B", "channel-A", "2");
  expect((await f.call(route("sync") + "?cursor=0", undefined, f.tokenB)).value.entries[0].envelope.key_epoch).toBe("1");
  expect((await f.call(route("publish"), f.publication("new", "2", { key_epoch: "2" }))).value.server_sequence).toBe("2");
  await f.restart();
  expect((await f.call("/v1/channels")).value.channels[0].key_epoch).toBe("2");
  expect((await f.call(route("sync") + "?cursor=0", undefined, f.tokenB)).value.entries).toHaveLength(2);
}));

test("watch carries only bounded metadata and heartbeats, publication wakes it", async () => fixture(async (f) => {
  const heartbeat = await f.call(route("watch") + "?head=0&wait_ms=10", undefined, f.tokenB);
  expect(heartbeat.value).toEqual({ head: "0", heartbeat: true });
  const pending = f.call(route("watch") + "?head=0&wait_ms=1000", undefined, f.tokenB);
  await new Promise((resolve) => setTimeout(resolve, 20)); await f.call(route("publish"), f.publication());
  expect((await pending).value).toEqual({ head: "1" });
  expect((await f.call(route("watch") + "?head=1&wait_ms=10001")).status).toBe(400);
}));

test("metadata reports bind sender/scope, are immutable and do not prove effects", async () => fixture(async (f) => {
  await f.call(route("publish"), f.publication());
  const value = { attempt_id: "attempt-A", publication_id: "publication-A", sink: "clipboard", outcome: "uncertain" };
  value.signature = sign(null, reportSigningBytes("synthetic-dev", "channel-A", "device-B", value), f.reader.privateKey).toString("base64");
  const first = await f.call(route("report"), value, f.tokenB); expect(first.value).toEqual({ attempt_id: "attempt-A", status: "ack" });
  expect((await f.call(route("report"), value, f.tokenB)).value).toEqual(first.value);
  expect((await f.call(route("report"), value)).status).toBe(403);
  const changed = { ...value, outcome: "applied" }; changed.signature = sign(null, reportSigningBytes("synthetic-dev", "channel-A", "device-B", changed), f.reader.privateKey).toString("base64");
  expect((await f.call(route("report"), changed, f.tokenB)).status).toBe(409);
  expect((await f.call(route("report"), { ...value, text: "must-not-store" }, f.tokenB)).status).toBe(400);
  await f.restart(); expect((await f.call(route("report"), value, f.tokenB)).value).toEqual(first.value);
}));

test("body, shape and base64 caps reject without commits or diagnostic payload", async () => fixture(async (f) => {
  const value = f.publication();
  for (const altered of [{ ...value, extra: true }, { ...value, origin_ordinal: 1 }, { ...value, signature: value.signature.slice(0, -2) }, { ...value, freshness: { kind: "deferred", lease_id: "unexpected" } }]) expect((await f.call(route("publish"), altered)).status).toBe(400);
  expect((await f.call(route("publish"), JSON.stringify(value).replace('"version":1', '"version":1,"version":1'))).status).toBe(400);
  expect((await f.call(route("publish"), "x".repeat(MAX_BODY + 1))).status).toBe(413);
  expect((await f.call(route("sync") + "?cursor=0")).value.head).toBe("0");
}));

test("aggregate response cap cuts contiguously and next page preserves bytes", async () => fixture(async (f) => {
  for (let index = 1; index <= 3; index++) expect((await f.call(route("publish"), f.publication(`large-${index}`, String(index), { ciphertext: randomBytes(MAX_CIPHERTEXT).toString("base64") }))).status).toBe(200);
  const first = await f.call(route("sync") + "?cursor=0"); expect(first.bytes).toBeLessThanOrEqual(MAX_BODY); expect(first.value.entries).toHaveLength(1); expect(first.value.next_cursor).toBe("1");
  const second = await f.call(route("sync") + "?cursor=1"); expect(second.value.entries[0].server_sequence).toBe("2"); expect(second.bytes).toBeLessThanOrEqual(MAX_BODY);
}));

test("publication framing has the precise Rust domain/order/endianness", async () => {
  const rust = await readFile(new URL("../src-tauri/src/shared_clipboard/wire.rs", import.meta.url), "utf8");
  expect(rust).toContain('b"Copicu.shared.publication.v1\\0"');
  const value = { version: 1, environment: "e", channel_id: "c", publication_id: "p", device_id: "d", origin_ordinal: "9007199254740993", key_epoch: "1", expires_at_unix_ms: "2", freshness: { kind: "deferred" }, nonce: Buffer.alloc(24, 7).toString("base64"), ciphertext: Buffer.alloc(16, 9).toString("base64") };
  const expected = "436f706963752e7368617265642e7075626c69636174696f6e2e76310001" + "0000000165000000016300000001700000000164" + "002000000000000100000000000000010000000000000002" + "00" + "00000018" + "07".repeat(24) + "00000010" + "09".repeat(16);
  expect(publicationSigningBytes(value).toString("hex")).toBe(expected);
});

test("issuer identity is pinned across restart and a replacement fails closed", async () => fixture(async (f) => {
  const proof = (await f.call(route("lease"), {})).value;
  await f.relay.stop();
  expect(() => createRelay({ ...f.config, leaseSigner: generateKeyPairSync("ed25519").privateKey })).toThrow("issuer identity mismatch");
  await f.restart();
  expect(f.relay.issuerPublicKey).toBe(f.issuer.publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64"));
  expect((await f.call(route("publish"), f.publication("pinned", "1", { freshness: { kind: "live", lease_id: proof.lease_id } }))).status).toBe(200);
}));

test("lease rejects admission at the exact expiry while accepted retries survive", async () => fixture(async (f) => {
  const proof = (await f.call(route("lease"), {})).value;
  const value = f.publication("accepted", "1", { freshness: { kind: "live", lease_id: proof.lease_id } });
  expect((await f.call(route("publish"), value)).status).toBe(200);
  f.advance(10_000);
  expect((await f.call(route("publish"), value)).status).toBe(200);
  expect((await f.call(route("publish"), f.publication("boundary", "2", { freshness: { kind: "live", lease_id: proof.lease_id } }))).status).toBe(409);
}));

test("publication row quota retains tombstones and accepts retries before quota", async () => fixture(async (f) => {
  const first = f.publication("first", "1", { expires_at_unix_ms: (f.time + 2n).toString() });
  const second = f.publication("second", "2");
  expect((await f.call(route("publish"), first)).status).toBe(200);
  const ack = await f.call(route("publish"), second); expect(ack.status).toBe(200);
  expect((await f.call(route("publish"), f.publication("over", "3"))).status).toBe(429);
  expect((await f.call(route("publish"), second)).value).toEqual(ack.value);
  f.advance(3); f.relay.prune();
  expect((await f.call(route("publish"), f.publication("over", "3"))).status).toBe(429);
  expect((await f.call(route("sync") + "?cursor=0")).value.gap).toEqual({ first_lost: "1", last_lost: "1" });
  f.advance(86_400_000); f.relay.prune();
  expect((await f.call(route("publish"), f.publication("replay", "2"))).status).toBe(409);
  expect((await f.call(route("publish"), f.publication("after-GC", "3"))).value.server_sequence).toBe("3");
}, { limits: { publicationsPerChannel: 2 } }));

test("payload quota counts exact stored bytes and frees only expired payload", async () => fixture(async (f) => {
  const first = f.publication("short", "1", { expires_at_unix_ms: (f.time + 2n).toString(), ciphertext: randomBytes(600).toString("base64") });
  const second = f.publication("over", "2", { ciphertext: randomBytes(600).toString("base64") });
  expect((await f.call(route("publish"), first)).status).toBe(200);
  expect((await f.call(route("publish"), second)).status).toBe(429);
  expect((await f.call(route("publish"), first)).status).toBe(200);
  f.advance(3); f.relay.prune();
  expect((await f.call(route("publish"), second)).value.server_sequence).toBe("2");
  await f.restart(); expect((await f.call(route("publish"), second)).status).toBe(200);
}, { limits: { payloadBytesPerChannel: 1800 } }));

test("pending lease quota rejects without evicting a proof, frees at expiry", async () => fixture(async (f) => {
  const proof = (await f.call(route("lease"), {})).value;
  expect((await f.call(route("lease"), {})).status).toBe(429);
  expect((await f.call(route("publish"), f.publication("live", "1", { freshness: { kind: "live", lease_id: proof.lease_id } }))).status).toBe(200);
  await f.restart(); expect((await f.call(route("lease"), {})).status).toBe(429);
  f.advance(10_000); expect((await f.call(route("lease"), {})).status).toBe(200);
  expect((await f.call(route("sync") + "?cursor=0")).value.entries[0].lease_proof).toEqual(proof);
}, { limits: { pendingLeases: 1 } }));

test("report quota and publication GC preserve authenticated immutable retries", async () => fixture(async (f) => {
  await f.call(route("publish"), f.publication());
  const signed = (attempt, outcome = "uncertain") => {
    const value = { attempt_id: attempt, publication_id: "publication-A", sink: "clipboard", outcome };
    value.signature = sign(null, reportSigningBytes("synthetic-dev", "channel-A", "device-B", value), f.reader.privateKey).toString("base64"); return value;
  };
  const report = signed("saved"); const ack = await f.call(route("report"), report, f.tokenB); expect(ack.status).toBe(200);
  expect((await f.call(route("report"), signed("over"), f.tokenB)).status).toBe(429);
  expect((await f.call(route("report"), report, f.tokenB)).value).toEqual(ack.value);
  f.advance(86_460_001); f.relay.prune(); await f.restart();
  expect((await f.call(route("report"), report, f.tokenB)).value).toEqual(ack.value);
  expect((await f.call(route("report"), signed("saved", "applied"), f.tokenB)).status).toBe(409);
  expect((await f.call(route("report"), report)).status).toBe(403);
  f.relay.revokeDevice("device-B"); expect((await f.call(route("report"), report, f.tokenB)).status).toBe(401);
}, { limits: { reportsPerChannel: 1 } }));

test("device and grant quotas rollback provisioning and preserve owner identities", async () => fixture(async (f) => {
  const extra = { ...f.config.devices[0], id: "device-C", token: randomBytes(32).toString("hex") };
  await f.relay.stop();
  expect(() => createRelay({ ...f.config, devices: [...f.config.devices, extra] })).toThrow("device_capacity");
  await f.restart(); expect((await f.call("/v1/channels")).status).toBe(200);
  await f.relay.stop();
  const devices = f.config.devices.map((device, index) => index === 0 ? { ...device, grants: [...device.grants, { channel_id: "channel-B", key_epoch: "1", read: true }] } : device);
  expect(() => createRelay({ ...f.config, devices })).toThrow("grant_capacity");
  await f.restart(); expect((await f.call("/v1/channels")).value.channels.map((channel) => channel.id)).toEqual(["channel-A"]);
  expect((await f.call("/v1/channels", undefined, extra.token)).status).toBe(401);
}, { limits: { devices: 2, grants: 2 } }));

test("quota defaults are explicit and invalid overrides fail before serving", async () => fixture(async (f) => {
  expect(DEFAULT_LIMITS).toEqual({ publicationsPerChannel: 4096, payloadBytesPerChannel: 67108864, pendingLeases: 1024, reportsPerChannel: 16384, devices: 256, grants: 4096, controlEventsPerPerson: 1024 });
  for (const limits of [{ devices: 0 }, { pendingLeases: 1.5 }, { grants: Number.MAX_SAFE_INTEGER + 1 }, { unknown: 1 }]) expect(() => createRelay({ ...f.config, limits })).toThrow("invalid relay limits");
}));

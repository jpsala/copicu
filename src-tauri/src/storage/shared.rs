//! Explicit opt-in sharing persistence; never initialized by startup/MIGRATIONS.
//! The feature-gated RuntimeStore admits only immutable VerifiedText and current
//! stored grants. Legacy private methods remain synthetic fixture candidates.

use super::{hash_text, normalize_text_for_storage, prune_history_from_conn, AppStorage};
use rusqlite::{params, Connection, OptionalExtension, Transaction};

const MAX_BYTES: usize = 2_000_000; // Matches bounded wire envelope, including body.
const MAX_TEXT_BYTES: usize = 1024 * 1024;
const MAX_PAGE: usize = 50;
const MAX_PENDING: i64 = 100;

const SCHEMA: &str = r#"
CREATE TABLE shared_subscriptions (
 id TEXT PRIMARY KEY, environment TEXT NOT NULL, channel TEXT NOT NULL, device TEXT NOT NULL,
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 generation BLOB NOT NULL CHECK(typeof(generation)='blob' AND length(generation)=8),
 bootstrap BLOB NOT NULL CHECK(typeof(bootstrap)='blob' AND length(bootstrap)=8),
 cursor BLOB NOT NULL CHECK(typeof(cursor)='blob' AND length(cursor)=8),
 retention_floor BLOB NOT NULL CHECK(typeof(retention_floor)='blob' AND length(retention_floor)=8),
 history_enabled INTEGER NOT NULL CHECK(history_enabled IN (0,1)), folder_id INTEGER,
 UNIQUE(environment,channel)
);
CREATE TABLE shared_ordinals (
 environment TEXT NOT NULL, channel TEXT NOT NULL, device TEXT NOT NULL,
 last_ordinal BLOB NOT NULL CHECK(typeof(last_ordinal)='blob' AND length(last_ordinal)=8),
 PRIMARY KEY(environment,channel,device)
);
CREATE TABLE shared_outbox (
 publication TEXT PRIMARY KEY, environment TEXT NOT NULL, channel TEXT NOT NULL, device TEXT NOT NULL,
 ordinal BLOB NOT NULL CHECK(typeof(ordinal)='blob' AND length(ordinal)=8 AND ordinal>zeroblob(8)),
 envelope BLOB, ciphertext BLOB, expires_at INTEGER,
 state TEXT NOT NULL CHECK(state IN ('preparing','queued','accepted','expired','cancelled','rejected')),
 commit_ambiguous INTEGER NOT NULL DEFAULT 0 CHECK(commit_ambiguous IN (0,1)),
 server_sequence BLOB CHECK(server_sequence IS NULL OR (typeof(server_sequence)='blob' AND length(server_sequence)=8 AND server_sequence>zeroblob(8))),
 CHECK((state IN ('preparing','cancelled','rejected') AND envelope IS NULL AND ciphertext IS NULL) OR
       (state!='preparing' AND typeof(envelope)='blob' AND length(envelope)>0 AND typeof(ciphertext)='blob' AND length(ciphertext)>0)),
 UNIQUE(environment,channel,device,ordinal)
);
CREATE TABLE shared_receipts (
 subscription TEXT NOT NULL REFERENCES shared_subscriptions(id), publication TEXT NOT NULL,
 sequence BLOB NOT NULL CHECK(typeof(sequence)='blob' AND length(sequence)=8 AND sequence>zeroblob(8)),
 generation BLOB NOT NULL CHECK(typeof(generation)='blob' AND length(generation)=8),
 envelope BLOB CHECK(envelope IS NULL OR (typeof(envelope)='blob' AND length(envelope)>0)), ciphertext BLOB,
 acquisition TEXT NOT NULL CHECK(acquisition IN ('pendingFetch','pendingKey','ready','rejected','expired')),
 delivery TEXT NOT NULL CHECK(delivery IN ('live','recovery','deferred')),
 self_origin INTEGER NOT NULL CHECK(self_origin IN (0,1)), expires_at INTEGER NOT NULL,
 authenticated INTEGER NOT NULL DEFAULT 0 CHECK(authenticated IN (0,1)),
 history_outcome TEXT NOT NULL DEFAULT 'pending' CHECK(history_outcome IN ('pending','applied','skipped','failed')),
 history_reason TEXT CHECK(history_reason IS NULL OR history_reason IN ('missingFolder')),
 local_item_id INTEGER REFERENCES clipboard_items(id) ON DELETE SET NULL,
 CHECK(acquisition!='ready' OR (typeof(ciphertext)='blob' AND length(ciphertext)>0) OR (authenticated=1 AND ciphertext IS NULL)),
 CHECK(acquisition='expired' OR (typeof(envelope)='blob' AND length(envelope)>0)),
 PRIMARY KEY(subscription,publication), UNIQUE(subscription,sequence)
);
CREATE TABLE shared_attempts (
 id TEXT PRIMARY KEY, subscription TEXT NOT NULL, publication TEXT NOT NULL,
 generation BLOB NOT NULL CHECK(typeof(generation)='blob' AND length(generation)=8),
 sink TEXT NOT NULL CHECK(sink IN ('clipboard','history','action')),
 manual INTEGER NOT NULL CHECK(manual IN (0,1)),
 outcome TEXT NOT NULL CHECK(outcome IN ('claimed','applied','failed','uncertain','skipped')),
 report TEXT NOT NULL CHECK(report IN ('none','pending','ack')),
 CHECK((outcome='claimed' AND report='none') OR (outcome!='claimed' AND report!='none')),
 FOREIGN KEY(subscription,publication) REFERENCES shared_receipts(subscription,publication)
);
CREATE UNIQUE INDEX shared_automatic_attempt ON shared_attempts(subscription,publication,sink) WHERE manual=0;
CREATE TABLE shared_effect_water (
 subscription TEXT NOT NULL REFERENCES shared_subscriptions(id), sink TEXT NOT NULL,
 sequence BLOB NOT NULL CHECK(typeof(sequence)='blob' AND length(sequence)=8),
 PRIMARY KEY(subscription,sink)
);
CREATE TABLE shared_gaps (
 id TEXT PRIMARY KEY, subscription TEXT NOT NULL REFERENCES shared_subscriptions(id),
 original_generation BLOB NOT NULL CHECK(typeof(original_generation)='blob' AND length(original_generation)=8),
 first_lost BLOB NOT NULL CHECK(typeof(first_lost)='blob' AND length(first_lost)=8),
 last_lost BLOB NOT NULL CHECK(typeof(last_lost)='blob' AND length(last_lost)=8),
 head BLOB NOT NULL CHECK(typeof(head)='blob' AND length(head)=8),
 new_generation BLOB NOT NULL CHECK(typeof(new_generation)='blob' AND length(new_generation)=8)
);
"#;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Error {
    Invalid,
    Missing,
    Conflict,
    Limit,
    Exhausted,
    StaleCursor,
    StaleGeneration,
    Ineligible,
    MissingFolder,
    Storage,
    Grant,
    Replay,
    Expired,
    Version,
}
pub(crate) type Result<T> = std::result::Result<T, Error>;
fn db(_: rusqlite::Error) -> Error {
    Error::Storage
}
fn id(value: &str) -> Result<()> {
    if value.is_empty()
        || value.len() > 128
        || !value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        Err(Error::Invalid)
    } else {
        Ok(())
    }
}
fn opaque(bytes: &[u8]) -> Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_BYTES {
        Err(Error::Limit)
    } else {
        Ok(())
    }
}
fn counter(value: u64) -> Vec<u8> {
    value.to_be_bytes().to_vec()
}
fn number(bytes: Vec<u8>) -> Result<u64> {
    Ok(u64::from_be_bytes(
        bytes.try_into().map_err(|_| Error::Invalid)?,
    ))
}
fn tx<T>(storage: &AppStorage, operation: impl FnOnce(&Transaction<'_>) -> Result<T>) -> Result<T> {
    let mut conn = storage.conn.lock().map_err(|_| Error::Storage)?;
    let tx = conn.transaction().map_err(db)?;
    let value = operation(&tx)?;
    tx.commit().map_err(db)?;
    Ok(value)
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Scope {
    environment: String,
    channel: String,
    device: String,
}
impl Scope {
    fn validate(&self) -> Result<()> {
        id(&self.environment)?;
        id(&self.channel)?;
        id(&self.device)
    }
}
#[derive(Clone, Debug, PartialEq, Eq)]
struct Reservation {
    publication: String,
    scope: Scope,
    ordinal: u64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Acquisition {
    PendingFetch,
    PendingKey,
    Ready,
    Rejected,
    Expired,
}
impl Acquisition {
    fn sql(self) -> &'static str {
        match self {
            Self::PendingFetch => "pendingFetch",
            Self::PendingKey => "pendingKey",
            Self::Ready => "ready",
            Self::Rejected => "rejected",
            Self::Expired => "expired",
        }
    }
}
#[derive(Clone, Copy)]
enum Delivery {
    Live,
    Recovery,
    Deferred,
}
impl Delivery {
    fn sql(self) -> &'static str {
        match self {
            Self::Live => "live",
            Self::Recovery => "recovery",
            Self::Deferred => "deferred",
        }
    }
}
// Metadata supplied by a future trusted adapter; this fixture does not verify it.
struct Arrival {
    publication: String,
    sequence: u64,
    origin: String,
    envelope: Vec<u8>,
    ciphertext: Option<Vec<u8>>,
    acquisition: Acquisition,
    delivery: Delivery,
    expires_at: i64,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct PageFence {
    pub(crate) cursor: u64,
    pub(crate) generation: u64,
}
#[derive(Clone, Copy)]
enum Outcome {
    Applied,
    Failed,
    Uncertain,
    Skipped,
}
impl Outcome {
    fn sql(self) -> &'static str {
        match self {
            Self::Applied => "applied",
            Self::Failed => "failed",
            Self::Uncertain => "uncertain",
            Self::Skipped => "skipped",
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum Sink {
    Clipboard,
    History,
    Action,
}
impl Sink {
    fn sql(self) -> &'static str {
        match self {
            Self::Clipboard => "clipboard",
            Self::History => "history",
            Self::Action => "action",
        }
    }
}
#[derive(Clone, Copy, PartialEq, Eq)]
enum AttemptMode {
    Automatic,
    Manual,
}
#[derive(Clone, Copy)]
enum OutboxFinal {
    Expired,
    Cancelled,
    Rejected,
}
impl OutboxFinal {
    fn sql(self) -> &'static str {
        match self {
            Self::Expired => "expired",
            Self::Cancelled => "cancelled",
            Self::Rejected => "rejected",
        }
    }
}

impl AppStorage {
    fn shared_subscribe(
        &self,
        sid: &str,
        scope: &Scope,
        head: u64,
        history: bool,
        folder: Option<i64>,
    ) -> Result<()> {
        id(sid)?;
        scope.validate()?;
        if folder.is_some_and(|v| v <= 0) {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            conn.execute(
                "INSERT INTO shared_subscriptions(id,environment,channel,device,enabled,generation,bootstrap,cursor,history_enabled,folder_id,retention_floor) VALUES (?1,?2,?3,?4,0,?5,?6,?6,?7,?8,zeroblob(8))",
                params![
                    sid,
                    scope.environment,
                    scope.channel,
                    scope.device,
                    counter(1),
                    counter(head),
                    history,
                    folder
                ],
            )
            .map_err(db)?;
            Ok(())
        })
    }
    // Storage transition only: enabled=false is NOT a native pause acknowledgement.
    fn shared_policy(&self, sid: &str, enabled: bool, head: u64) -> Result<u64> {
        tx(self, |conn| {
            let (generation, bootstrap, cursor): (Vec<u8>, Vec<u8>, Vec<u8>) = conn
                .query_row(
                    "SELECT generation,bootstrap,cursor FROM shared_subscriptions WHERE id=?1",
                    [sid],
                    |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
                )
                .optional()
                .map_err(db)?
                .ok_or(Error::Missing)?;
            if head < number(bootstrap)?.max(number(cursor)?) {
                return Err(Error::StaleCursor);
            }
            let next = number(generation)?.checked_add(1).ok_or(Error::Exhausted)?;
            conn.execute(
                "UPDATE shared_subscriptions SET enabled=?2,generation=?3,bootstrap=?4 WHERE id=?1",
                params![sid, enabled, counter(next), counter(head)],
            )
            .map_err(db)?;
            Ok(next)
        })
    }
    fn shared_reserve(&self, publication: &str, scope: &Scope) -> Result<Reservation> {
        id(publication)?;
        scope.validate()?;
        tx(self, |conn| {
            let existing:Option<(String,String,String,Vec<u8>)>=conn.query_row("SELECT environment,channel,device,ordinal FROM shared_outbox WHERE publication=?1",[publication],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(db)?;
            if let Some((env, channel, device, ordinal)) = existing {
                if (env, channel, device)
                    != (
                        scope.environment.clone(),
                        scope.channel.clone(),
                        scope.device.clone(),
                    )
                {
                    return Err(Error::Conflict);
                }
                return Ok(Reservation {
                    publication: publication.into(),
                    scope: scope.clone(),
                    ordinal: number(ordinal)?,
                });
            }
            let pending: i64 = conn
                .query_row(
                    "SELECT COUNT(*) FROM shared_outbox WHERE state IN ('preparing','queued')",
                    [],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if pending >= MAX_PENDING {
                return Err(Error::Limit);
            }
            let last:Option<Vec<u8>>=conn.query_row("SELECT last_ordinal FROM shared_ordinals WHERE environment=?1 AND channel=?2 AND device=?3",params![scope.environment,scope.channel,scope.device],|r|r.get(0)).optional().map_err(db)?;
            let ordinal = last
                .map(number)
                .transpose()?
                .unwrap_or(0)
                .checked_add(1)
                .ok_or(Error::Exhausted)?;
            conn.execute("INSERT INTO shared_ordinals VALUES (?1,?2,?3,?4) ON CONFLICT(environment,channel,device) DO UPDATE SET last_ordinal=excluded.last_ordinal",params![scope.environment,scope.channel,scope.device,counter(ordinal)]).map_err(db)?;
            conn.execute("INSERT INTO shared_outbox(publication,environment,channel,device,ordinal,state) VALUES (?1,?2,?3,?4,?5,'preparing')",params![publication,scope.environment,scope.channel,scope.device,counter(ordinal)]).map_err(db)?;
            Ok(Reservation {
                publication: publication.into(),
                scope: scope.clone(),
                ordinal,
            })
        })
    }
    fn shared_queue(
        &self,
        reservation: &Reservation,
        envelope: &[u8],
        ciphertext: &[u8],
        expires_at: i64,
        now: i64,
    ) -> Result<()> {
        opaque(envelope)?;
        opaque(ciphertext)?;
        tx(self, |conn| {
            let (env,channel,device,ordinal,state,old_envelope,old_cipher,old_expiry):(String,String,String,Vec<u8>,String,Option<Vec<u8>>,Option<Vec<u8>>,Option<i64>)=conn.query_row("SELECT environment,channel,device,ordinal,state,envelope,ciphertext,expires_at FROM shared_outbox WHERE publication=?1",[&reservation.publication],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if (env, channel, device)
                != (
                    reservation.scope.environment.clone(),
                    reservation.scope.channel.clone(),
                    reservation.scope.device.clone(),
                )
                || number(ordinal)? != reservation.ordinal
            {
                return Err(Error::Conflict);
            }
            // Resolve exact retries before expiry: a prior commit is immutable.
            if state != "preparing" {
                return if old_envelope.as_deref() == Some(envelope)
                    && old_cipher.as_deref() == Some(ciphertext)
                    && old_expiry == Some(expires_at)
                {
                    if state == "queued" || state == "accepted" {
                        Ok(())
                    } else {
                        Err(Error::Ineligible)
                    }
                } else {
                    Err(Error::Conflict)
                };
            }
            if now < 0 || expires_at <= now {
                return Err(Error::Ineligible);
            }
            conn.execute("UPDATE shared_outbox SET envelope=?2,ciphertext=?3,expires_at=?4,state='queued' WHERE publication=?1",params![reservation.publication,envelope,ciphertext,expires_at]).map_err(db)?;
            Ok(())
        })
    }
    fn shared_accept(&self, publication: &str, sequence: u64) -> Result<()> {
        if sequence == 0 {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            let (state, old): (String, Option<Vec<u8>>) = conn
                .query_row(
                    "SELECT state,server_sequence FROM shared_outbox WHERE publication=?1",
                    [publication],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(db)?
                .ok_or(Error::Missing)?;
            if state == "accepted" {
                return if old == Some(counter(sequence)) {
                    Ok(())
                } else {
                    Err(Error::Conflict)
                };
            }
            if state != "queued" {
                return Err(Error::Ineligible);
            }
            conn.execute(
                "UPDATE shared_outbox SET state='accepted',server_sequence=?2 WHERE publication=?1",
                params![publication, counter(sequence)],
            )
            .map_err(db)?;
            Ok(())
        })
    }
    fn shared_outbox_final(
        &self,
        publication: &str,
        scope: &Scope,
        outcome: OutboxFinal,
        commit_ambiguous: bool,
        now: i64,
    ) -> Result<()> {
        scope.validate()?;
        if now < 0 {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            let (state,expiry,prior_ambiguous):(String,Option<i64>,bool)=conn.query_row("SELECT state,expires_at,commit_ambiguous FROM shared_outbox WHERE publication=?1 AND environment=?2 AND channel=?3 AND device=?4",params![publication,scope.environment,scope.channel,scope.device],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if state == outcome.sql() {
                return if prior_ambiguous == commit_ambiguous {
                    Ok(())
                } else {
                    Err(Error::Conflict)
                };
            }
            if state != "preparing" && state != "queued" {
                return Err(Error::Conflict);
            }
            if matches!(outcome, OutboxFinal::Expired) && expiry.is_none_or(|expiry| expiry > now) {
                return Err(Error::Ineligible);
            }
            conn.execute(
                "UPDATE shared_outbox SET state=?2,commit_ambiguous=?3 WHERE publication=?1",
                params![publication, outcome.sql(), commit_ambiguous],
            )
            .map_err(db)?;
            Ok(())
        })
    }
    // Selection is not an upload acknowledgement. Repeated calls return the same
    // queued ID until a recorded terminal outcome. A preparing ordinal blocks FIFO.
    fn shared_next_queued(&self, scope: &Scope, now: i64) -> Result<Option<Reservation>> {
        scope.validate()?;
        if now < 0 {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            // No transport attempt journal exists in this candidate. Conservatively
            // retain possible remote-commit ambiguity rather than promise retraction.
            conn.execute("UPDATE shared_outbox SET state='expired',commit_ambiguous=1 WHERE environment=?1 AND channel=?2 AND device=?3 AND state='queued' AND expires_at<=?4",params![scope.environment,scope.channel,scope.device,now]).map_err(db)?;
            let next:Option<(String,Vec<u8>,String)>=conn.query_row("SELECT publication,ordinal,state FROM shared_outbox WHERE environment=?1 AND channel=?2 AND device=?3 AND state IN ('preparing','queued') ORDER BY ordinal LIMIT 1",params![scope.environment,scope.channel,scope.device],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?;
            match next {
                Some((publication, ordinal, state)) if state == "queued" => Ok(Some(Reservation {
                    publication,
                    scope: scope.clone(),
                    ordinal: number(ordinal)?,
                })),
                _ => Ok(None),
            }
        })
    }
    // A trusted transport must supply its retention floor/head. This only records
    // that gap; it is not a proof of authorization, authenticity or server honesty.
    fn shared_retention_gap(
        &self,
        sid: &str,
        gap_id: &str,
        fence: PageFence,
        floor: u64,
        head: u64,
    ) -> Result<PageFence> {
        id(gap_id)?;
        let first = fence.cursor.checked_add(1).ok_or(Error::Exhausted)?;
        let last = floor.checked_sub(1).ok_or(Error::Invalid)?;
        // An empty retained channel has floor=head+1; compare the already
        // checked last_lost value instead of computing head+1 at u64::MAX.
        if floor <= first || head < last {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            let prior:Option<(String,Vec<u8>,Vec<u8>,Vec<u8>,Vec<u8>,Vec<u8>)>=conn.query_row("SELECT subscription,original_generation,first_lost,last_lost,head,new_generation FROM shared_gaps WHERE id=?1",[gap_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?))).optional().map_err(db)?;
            if let Some((
                subscription,
                generation,
                first_lost,
                last_lost,
                old_head,
                new_generation,
            )) = prior
            {
                if subscription != sid
                    || number(generation)? != fence.generation
                    || number(first_lost)? != first
                    || number(last_lost)? != last
                    || number(old_head)? != head
                {
                    return Err(Error::Conflict);
                }
                return Ok(PageFence {
                    cursor: last,
                    generation: number(new_generation)?,
                });
            }
            let (cursor,generation,bootstrap,old_floor):(Vec<u8>,Vec<u8>,Vec<u8>,Vec<u8>)=conn.query_row("SELECT cursor,generation,bootstrap,retention_floor FROM shared_subscriptions WHERE id=?1",[sid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if number(cursor)? != fence.cursor {
                return Err(Error::StaleCursor);
            }
            if number(generation)? != fence.generation {
                return Err(Error::StaleGeneration);
            }
            if head < number(bootstrap)? || floor <= number(old_floor)? {
                return Err(Error::StaleCursor);
            }
            let active:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM shared_attempts WHERE subscription=?1 AND outcome='claimed')",[sid],|r|r.get(0)).map_err(db)?;
            if active {
                return Err(Error::Ineligible);
            }
            let generation = fence.generation.checked_add(1).ok_or(Error::Exhausted)?;
            conn.execute(
                "INSERT INTO shared_gaps VALUES (?1,?2,?3,?4,?5,?6,?7)",
                params![
                    gap_id,
                    sid,
                    counter(fence.generation),
                    counter(first),
                    counter(last),
                    counter(head),
                    counter(generation)
                ],
            )
            .map_err(db)?;
            conn.execute("UPDATE shared_subscriptions SET cursor=?2,generation=?3,bootstrap=?4,retention_floor=?5 WHERE id=?1",params![sid,counter(last),counter(generation),counter(head),counter(floor)]).map_err(db)?;
            Ok(PageFence {
                cursor: last,
                generation,
            })
        })
    }
    // Explicit fixture retention inputs: no shipping age/count defaults. Keep
    // receipt/attempt tombstones so pruning cannot restore automatic eligibility.
    // Metadata compaction of tombstones requires a later policy; it is not faked.
    fn shared_prune_receipts(&self, sid: &str, now: i64, keep_latest: usize) -> Result<usize> {
        if now < 0 {
            return Err(Error::Invalid);
        }
        let keep_latest = i64::try_from(keep_latest).map_err(|_| Error::Invalid)?;
        tx(self, |conn| {
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM shared_subscriptions WHERE id=?1)",
                    [sid],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if !exists {
                return Err(Error::Missing);
            }
            conn.execute("UPDATE shared_receipts SET envelope=NULL,ciphertext=NULL,acquisition='expired' WHERE subscription=?1 AND (envelope IS NOT NULL OR ciphertext IS NOT NULL) AND (expires_at<=?2 OR (acquisition IN ('ready','rejected','expired') AND sequence NOT IN (SELECT sequence FROM shared_receipts WHERE subscription=?1 ORDER BY sequence DESC LIMIT ?3))) AND NOT EXISTS(SELECT 1 FROM shared_attempts a WHERE a.subscription=shared_receipts.subscription AND a.publication=shared_receipts.publication AND (a.outcome='claimed' OR a.report='pending'))",params![sid,now,keep_latest]).map_err(db)
        })
    }
    // Receipts and their cursor commit together. Pages must be contiguous; a
    // retention gap needs the explicit fenced operation, never a silent jump.
    fn shared_store_page(&self, sid: &str, fence: PageFence, entries: &[Arrival]) -> Result<u64> {
        if entries.len() > MAX_PAGE {
            return Err(Error::Limit);
        }
        tx(self, |conn| {
            let (cursor,generation,bootstrap,enabled,device):(Vec<u8>,Vec<u8>,Vec<u8>,bool,String)=conn.query_row("SELECT cursor,generation,bootstrap,enabled,device FROM shared_subscriptions WHERE id=?1",[sid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if number(cursor)? != fence.cursor {
                return Err(Error::StaleCursor);
            }
            if number(generation.clone())? != fence.generation {
                return Err(Error::StaleGeneration);
            }
            let bootstrap = number(bootstrap)?;
            let mut last = fence.cursor;
            for entry in entries {
                id(&entry.publication)?;
                id(&entry.origin)?;
                opaque(&entry.envelope)?;
                if entry.sequence != last.checked_add(1).ok_or(Error::Exhausted)?
                    || entry.expires_at < 0
                {
                    return Err(Error::Invalid);
                }
                if let Some(cipher) = &entry.ciphertext {
                    opaque(cipher)?;
                }
                if entry.acquisition == Acquisition::Ready && entry.ciphertext.is_none() {
                    return Err(Error::Invalid);
                }
                let delivery = if !enabled || entry.sequence <= bootstrap {
                    "recovery"
                } else {
                    entry.delivery.sql()
                };
                conn.execute("INSERT INTO shared_receipts(subscription,publication,sequence,generation,envelope,ciphertext,acquisition,delivery,self_origin,expires_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)",params![sid,entry.publication,counter(entry.sequence),generation,entry.envelope,entry.ciphertext,entry.acquisition.sql(),delivery,entry.origin==device,entry.expires_at]).map_err(|_|Error::Conflict)?;
                last = entry.sequence;
            }
            let pending:i64=conn.query_row("SELECT COUNT(*) FROM shared_receipts WHERE subscription=?1 AND acquisition IN ('pendingFetch','pendingKey')",[sid],|r|r.get(0)).map_err(db)?;
            if pending > MAX_PENDING {
                return Err(Error::Limit);
            }
            conn.execute(
                "UPDATE shared_subscriptions SET cursor=?2 WHERE id=?1",
                params![sid, counter(last)],
            )
            .map_err(db)?;
            Ok(last)
        })
    }
    fn shared_resolve(
        &self,
        sid: &str,
        publication: &str,
        acquisition: Acquisition,
        ciphertext: Option<&[u8]>,
    ) -> Result<()> {
        if let Some(bytes) = ciphertext {
            opaque(bytes)?;
        }
        if acquisition == Acquisition::Ready && ciphertext.is_none() {
            return Err(Error::Invalid);
        }
        if acquisition == Acquisition::PendingFetch {
            return Err(Error::Invalid);
        }
        tx(self, |conn| {
            let (state,old):(String,Option<Vec<u8>>)=conn.query_row("SELECT acquisition,ciphertext FROM shared_receipts WHERE subscription=?1 AND publication=?2",params![sid,publication],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if old.as_deref().is_some_and(|v| Some(v) != ciphertext) {
                return Err(Error::Conflict);
            }
            if state != "pendingFetch" && state != "pendingKey" {
                return if state == acquisition.sql() && old.as_deref() == ciphertext {
                    Ok(())
                } else {
                    Err(Error::Conflict)
                };
            }
            conn.execute("UPDATE shared_receipts SET acquisition=?3,ciphertext=COALESCE(ciphertext,?4) WHERE subscription=?1 AND publication=?2",params![sid,publication,acquisition.sql(),ciphertext]).map_err(db)?;
            Ok(())
        })
    }
    fn shared_claim(&self, sid: &str, publication: &str, attempt: &str, now: i64) -> Result<()> {
        self.shared_claim_sink(
            sid,
            publication,
            attempt,
            Sink::Clipboard,
            AttemptMode::Automatic,
            now,
        )
    }
    // Manual is a NEW host-authorized intention, not an automatic retry. A future
    // adapter must issue a fresh native guard and cannot accept this enum from a
    // runner as authorization. It never clears a prior automatic claim/high-water.
    fn shared_claim_sink(
        &self,
        sid: &str,
        publication: &str,
        attempt: &str,
        sink: Sink,
        mode: AttemptMode,
        now: i64,
    ) -> Result<()> {
        id(attempt)?;
        tx(self, |conn| {
            if mode == AttemptMode::Automatic {
                let claimed:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM shared_attempts WHERE subscription=?1 AND publication=?2 AND sink=?3 AND manual=0)",params![sid,publication,sink.sql()],|r|r.get(0)).map_err(db)?;
                if claimed {
                    return Err(Error::Conflict);
                }
            }
            let selector = if mode == AttemptMode::Manual {
                "SELECT EXISTS(SELECT 1 FROM shared_receipts WHERE subscription=?1 AND publication=?2 AND acquisition='ready' AND ciphertext IS NOT NULL AND expires_at>?3)"
            } else if sink == Sink::History {
                "SELECT EXISTS(SELECT 1 FROM shared_receipts r JOIN shared_subscriptions s ON s.id=r.subscription WHERE r.subscription=?1 AND r.publication=?2 AND s.enabled=1 AND s.history_enabled=1 AND r.generation=s.generation AND r.acquisition='ready' AND r.self_origin=0 AND r.expires_at>?3)"
            } else {
                "SELECT EXISTS(SELECT 1 FROM shared_receipts r JOIN shared_subscriptions s ON s.id=r.subscription WHERE r.subscription=?1 AND r.publication=?2 AND s.enabled=1 AND r.generation=s.generation AND r.sequence>s.bootstrap AND r.acquisition='ready' AND r.delivery='live' AND r.self_origin=0 AND r.expires_at>?3 AND r.sequence=(SELECT MAX(sequence) FROM shared_receipts n WHERE n.subscription=s.id AND n.generation=s.generation AND n.sequence>s.bootstrap AND n.acquisition='ready' AND n.delivery='live' AND n.self_origin=0 AND n.expires_at>?3))"
            };
            let eligible: bool = conn
                .query_row(selector, params![sid, publication, now], |r| r.get(0))
                .map_err(db)?;
            if !eligible || now < 0 {
                return Err(Error::Ineligible);
            }
            let active:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM shared_attempts WHERE subscription=?1 AND sink=?2 AND outcome='claimed')",params![sid,sink.sql()],|r|r.get(0)).map_err(db)?;
            if active {
                return Err(Error::Ineligible);
            }
            let sequence: Vec<u8> = conn
                .query_row(
                    "SELECT sequence FROM shared_receipts WHERE subscription=?1 AND publication=?2",
                    params![sid, publication],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if sink != Sink::History {
                let water:Option<Vec<u8>>=conn.query_row("SELECT sequence FROM shared_effect_water WHERE subscription=?1 AND sink=?2",params![sid,sink.sql()],|r|r.get(0)).optional().map_err(db)?;
                if mode == AttemptMode::Automatic
                    && water.as_ref().is_some_and(|water| sequence <= *water)
                {
                    return Err(Error::Ineligible);
                }
                conn.execute("INSERT INTO shared_effect_water VALUES (?1,?2,?3) ON CONFLICT(subscription,sink) DO UPDATE SET sequence=MAX(shared_effect_water.sequence,excluded.sequence)",params![sid,sink.sql(),sequence]).map_err(db)?;
            }
            conn.execute("INSERT INTO shared_attempts(id,subscription,publication,generation,sink,manual,outcome,report) SELECT ?3,r.subscription,r.publication,s.generation,?4,?5,'claimed','none' FROM shared_receipts r JOIN shared_subscriptions s ON s.id=r.subscription WHERE r.subscription=?1 AND r.publication=?2",params![sid,publication,attempt,sink.sql(),mode==AttemptMode::Manual]).map_err(|_|Error::Conflict)?;
            Ok(())
        })
    }
    fn shared_finish(&self, sid: &str, attempt: &str, outcome: Outcome) -> Result<()> {
        tx(self, |conn| {
            let prior: String = conn
                .query_row(
                    "SELECT outcome FROM shared_attempts WHERE id=?1 AND subscription=?2",
                    params![attempt, sid],
                    |r| r.get(0),
                )
                .optional()
                .map_err(db)?
                .ok_or(Error::Missing)?;
            if prior != "claimed" {
                return if prior == outcome.sql() {
                    Ok(())
                } else {
                    Err(Error::Conflict)
                };
            }
            conn.execute("UPDATE shared_attempts SET outcome=?3,report='pending' WHERE id=?1 AND subscription=?2",params![attempt,sid,outcome.sql()]).map_err(db)?;
            Ok(())
        })
    }
    fn shared_ack_report(&self, sid: &str, attempt: &str) -> Result<()> {
        tx(self, |conn| {
            let changed=conn.execute("UPDATE shared_attempts SET report='ack' WHERE id=?1 AND subscription=?2 AND outcome!='claimed'",params![attempt,sid]).map_err(db)?;
            if changed == 0 {
                return Err(Error::Ineligible);
            }
            Ok(())
        })
    }
    // Storage-only recovery. A future native supervisor must prove its executor
    // stopped before invoking this; a timeout/silence does not establish that.
    fn shared_recover(&self, sid: &str, executor_stopped: bool) -> Result<usize> {
        if !executor_stopped {
            return Err(Error::Ineligible);
        }
        tx(self, |conn| {
            let generation: Vec<u8> = conn
                .query_row(
                    "SELECT generation FROM shared_subscriptions WHERE id=?1",
                    [sid],
                    |r| r.get(0),
                )
                .optional()
                .map_err(db)?
                .ok_or(Error::Missing)?;
            let next = number(generation)?.checked_add(1).ok_or(Error::Exhausted)?;
            conn.execute(
                "UPDATE shared_subscriptions SET enabled=0,generation=?2 WHERE id=?1",
                params![sid, counter(next)],
            )
            .map_err(db)?;
            conn.execute("UPDATE shared_attempts SET outcome='uncertain',report='pending' WHERE subscription=?1 AND outcome='claimed'",[sid]).map_err(db)
        })
    }
    // Synthetic decoded text only: no product adapter may expose this until it
    // authenticates/decrypts the corresponding immutable envelope/ciphertext.
    fn shared_import_fixture(
        &self,
        sid: &str,
        publication: &str,
        generation: u64,
        text: &str,
        now: i64,
    ) -> Result<i64> {
        if text.len() > MAX_TEXT_BYTES || now < 0 {
            return Err(Error::Invalid);
        }
        let normalized = normalize_text_for_storage(text);
        if normalized.is_empty() {
            return Err(Error::Invalid);
        }
        let hash = hash_text(&normalized);
        let result = tx(self, |conn| {
            let (enabled,history,current,folder,acquisition,self_origin,history_outcome,item,original_generation,expires_at):(bool,bool,Vec<u8>,Option<i64>,String,bool,String,Option<i64>,Vec<u8>,i64)=conn.query_row("SELECT s.enabled,s.history_enabled,s.generation,s.folder_id,r.acquisition,r.self_origin,r.history_outcome,r.local_item_id,r.generation,r.expires_at FROM shared_subscriptions s JOIN shared_receipts r ON r.subscription=s.id WHERE s.id=?1 AND r.publication=?2",params![sid,publication],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?,r.get(9)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
            if history_outcome == "applied" {
                return Ok(Ok((
                    item.ok_or(Error::Ineligible)?,
                    false,
                    super::PruneOutcome {
                        blob_paths: Vec::new(),
                        removed_items: 0,
                    },
                )));
            }
            if history_outcome == "failed" {
                return Ok(Err(Error::MissingFolder));
            }
            if !enabled
                || !history
                || number(current)? != generation
                || number(original_generation)? != generation
                || acquisition != "ready"
                || expires_at <= now
                || self_origin
            {
                return Err(Error::Ineligible);
            }
            if let Some(folder) = folder {
                let exists: bool = conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM folders WHERE id=?1)",
                        [folder],
                        |r| r.get(0),
                    )
                    .map_err(db)?;
                if !exists {
                    conn.execute("UPDATE shared_receipts SET history_outcome='failed',history_reason='missingFolder' WHERE subscription=?1 AND publication=?2",params![sid,publication]).map_err(db)?;
                    return Ok(Err(Error::MissingFolder));
                }
            }
            let existing: Option<i64> = conn
                .query_row(
                    "SELECT id FROM clipboard_items WHERE normalized_hash=?1",
                    [&hash],
                    |r| r.get(0),
                )
                .optional()
                .map_err(db)?;
            let item = if let Some(item) = existing {
                item
            } else {
                conn.execute("INSERT INTO clipboard_items(content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms,copy_count,mime_primary,folder_id) VALUES ('text',?1,?2,?3,?3,NULL,0,'text/plain',?4)",params![text,hash,now,folder]).map_err(db)?;
                conn.last_insert_rowid()
            };
            conn.execute("UPDATE shared_receipts SET history_outcome='applied',local_item_id=?3 WHERE subscription=?1 AND publication=?2",params![sid,publication,item]).map_err(db)?;
            let prune = prune_history_from_conn(conn).map_err(|_| Error::Storage)?;
            Ok(Ok((item, existing.is_none(), prune)))
        })?;
        let (item, created, prune) = result?;
        if created || prune.removed_items > 0 {
            self.bump_mutation_epoch();
        }
        self.remove_blob_paths(prune.blob_paths);
        Ok(item)
    }
}

#[cfg(feature = "shared-clipboard")]
#[allow(unused_imports)] // Host API exports; only the fixture host is wired today.
pub(crate) use runtime::{
    Grant, HistoryOutcome, PendingReport, Policy, RuntimeStore, Subscribe, VerifiedArrival,
};

#[cfg(feature = "shared-clipboard")]
mod runtime {
    use super::*;
    use crate::shared_clipboard::{
        crypto::VerifiedText,
        wire::{self, Freshness},
    };
    use ed25519_dalek::{Signature, VerifyingKey};
    const EXTRA_SCHEMA: &str = r#"
CREATE TABLE shared_runtime_version(id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL);
INSERT INTO shared_runtime_version VALUES(1,1);
CREATE TABLE shared_grants(environment TEXT NOT NULL,channel TEXT NOT NULL,origin TEXT NOT NULL,public_key BLOB NOT NULL CHECK(length(public_key)=32),epoch BLOB NOT NULL CHECK(length(epoch)=8),revision BLOB NOT NULL CHECK(length(revision)=8),authorized INTEGER NOT NULL CHECK(authorized IN(0,1)),PRIMARY KEY(environment,channel,origin));
CREATE TABLE shared_replay(environment TEXT NOT NULL,channel TEXT NOT NULL,origin TEXT NOT NULL,epoch BLOB NOT NULL CHECK(length(epoch)=8),ordinal BLOB NOT NULL CHECK(length(ordinal)=8),PRIMARY KEY(environment,channel,origin,epoch));
"#;
    /// Host-owned objects, deliberately no serde or runner permission fields.
    pub(crate) struct Subscribe {
        pub(crate) id: String,
        pub(crate) environment: String,
        pub(crate) channel: String,
        pub(crate) local_device: String,
        pub(crate) head: u64,
        pub(crate) history_enabled: bool,
        pub(crate) folder_id: Option<i64>,
    }
    pub(crate) struct Grant {
        pub(crate) environment: String,
        pub(crate) channel: String,
        pub(crate) origin: String,
        pub(crate) public_key: [u8; 32],
        pub(crate) epoch: u64,
        pub(crate) revision: u64,
    }
    pub(crate) enum Policy {
        Paused,
        ReceiveMetadata,
    }
    pub(crate) struct VerifiedArrival<'a> {
        pub(crate) server_sequence: u64,
        pub(crate) text: &'a VerifiedText,
    }
    /// Metadata only; safe to sign/retry after crashes or grant changes. Sending
    /// this report never grants or repeats an effect. No ciphertext/key/text.
    pub(crate) struct PendingReport {
        pub(crate) environment: String,
        pub(crate) channel: String,
        pub(crate) device: String,
        pub(crate) attempt_id: String,
        pub(crate) publication_id: String,
        pub(crate) sink: String,
        pub(crate) outcome: String,
    }
    #[derive(Debug, PartialEq, Eq)]
    pub(crate) enum HistoryOutcome {
        Applied { item: Option<i64> },
        MissingFolder,
    }
    pub(crate) struct RuntimeStore<'a> {
        storage: &'a AppStorage,
    }
    fn timestamp(value: u64) -> Result<i64> {
        i64::try_from(value).map_err(|_| Error::Invalid)
    }
    fn serialized(text: &VerifiedText) -> Result<Vec<u8>> {
        if text.text().len() > MAX_TEXT_BYTES {
            return Err(Error::Limit);
        }
        let bytes = serde_json::to_vec(text.envelope()).map_err(|_| Error::Invalid)?;
        opaque(&bytes)?;
        Ok(bytes)
    }
    fn current_grant(conn: &Connection, text: &VerifiedText, now: i64) -> Result<()> {
        let e = text.envelope();
        let (key,epoch,active):(Vec<u8>,Vec<u8>,bool)=conn.query_row("SELECT public_key,epoch,authorized FROM shared_grants WHERE environment=?1 AND channel=?2 AND origin=?3",params![e.environment,e.channel_id,e.device_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?.ok_or(Error::Grant)?;
        if !active || number(epoch)? != wire::counter(&e.key_epoch).map_err(|_| Error::Invalid)? {
            return Err(Error::Grant);
        }
        let key: [u8; 32] = key.try_into().map_err(|_| Error::Grant)?;
        let key = VerifyingKey::from_bytes(&key).map_err(|_| Error::Grant)?;
        if key.is_weak() {
            return Err(Error::Grant);
        }
        let signature = Signature::from_slice(&e.signature).map_err(|_| Error::Grant)?;
        key.verify_strict(&e.signing_bytes().map_err(|_| Error::Invalid)?, &signature)
            .map_err(|_| Error::Grant)?;
        if timestamp(wire::counter(&e.expires_at_unix_ms).map_err(|_| Error::Invalid)?)? <= now {
            return Err(Error::Expired);
        }
        Ok(())
    }
    fn subscription(
        conn: &Connection,
        sid: &str,
        fence: PageFence,
    ) -> Result<(String, String, String, bool, u64)> {
        let (env,channel,device,cursor,generation,enabled,bootstrap):(String,String,String,Vec<u8>,Vec<u8>,bool,Vec<u8>)=conn.query_row("SELECT environment,channel,device,cursor,generation,enabled,bootstrap FROM shared_subscriptions WHERE id=?1",[sid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
        if number(generation)? != fence.generation {
            return Err(Error::StaleGeneration);
        }
        if number(cursor)? != fence.cursor {
            return Err(Error::StaleCursor);
        }
        Ok((env, channel, device, enabled, number(bootstrap)?))
    }
    fn invalidate(conn: &Connection, environment: &str, channel: &str) -> Result<()> {
        let active:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM shared_attempts a JOIN shared_subscriptions s ON s.id=a.subscription WHERE s.environment=?1 AND s.channel=?2 AND a.outcome='claimed')",params![environment,channel],|r|r.get(0)).map_err(db)?;
        if active {
            return Err(Error::Ineligible);
        }
        let rows = {
            let mut stmt=conn.prepare("SELECT id,generation FROM shared_subscriptions WHERE environment=?1 AND channel=?2").map_err(db)?;
            let rows = stmt
                .query_map(params![environment, channel], |r| {
                    Ok((r.get::<_, String>(0)?, r.get::<_, Vec<u8>>(1)?))
                })
                .map_err(db)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(db)?;
            rows
        };
        for (sid, generation) in rows {
            let next = number(generation)?.checked_add(1).ok_or(Error::Exhausted)?;
            conn.execute("UPDATE shared_subscriptions SET enabled=0,generation=?2,bootstrap=cursor WHERE id=?1",params![sid,counter(next)]).map_err(db)?;
        }
        Ok(())
    }
    impl<'a> RuntimeStore<'a> {
        /// Explicit owner initialization; no implicit migration of unversioned
        /// candidate stores, no product startup or profile discovery.
        pub(crate) fn init(storage: &'a AppStorage) -> Result<Self> {
            tx(storage, |conn| {
                let exists:bool=conn.query_row("SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name='shared_runtime_version')",[],|r|r.get(0)).map_err(db)?;
                if exists {
                    let version: i64 = conn
                        .query_row(
                            "SELECT version FROM shared_runtime_version WHERE id=1",
                            [],
                            |r| r.get(0),
                        )
                        .map_err(|_| Error::Version)?;
                    let count:i64=conn.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('shared_subscriptions','shared_ordinals','shared_outbox','shared_receipts','shared_attempts','shared_effect_water','shared_gaps','shared_grants','shared_replay','shared_runtime_version')",[],|r|r.get(0)).map_err(db)?;
                    if version != 1 || count != 10 {
                        return Err(Error::Version);
                    }
                    conn.prepare("SELECT authenticated FROM shared_receipts LIMIT 0")
                        .map_err(|_| Error::Version)?;
                } else {
                    let legacy: bool = conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM sqlite_master WHERE name LIKE 'shared_%')",
                            [],
                            |r| r.get(0),
                        )
                        .map_err(db)?;
                    if legacy {
                        return Err(Error::Version);
                    }
                    conn.execute_batch(SCHEMA).map_err(db)?;
                    conn.execute_batch(EXTRA_SCHEMA).map_err(db)?;
                }
                Ok(())
            })?;
            Ok(Self { storage })
        }
        pub(crate) fn subscribe(&self, options: Subscribe) -> Result<PageFence> {
            let scope = Scope {
                environment: options.environment,
                channel: options.channel,
                device: options.local_device,
            };
            self.storage.shared_subscribe(
                &options.id,
                &scope,
                options.head,
                options.history_enabled,
                options.folder_id,
            )?;
            self.fence(&options.id)
        }
        pub(crate) fn fence(&self, sid: &str) -> Result<PageFence> {
            let conn = self.storage.conn.lock().map_err(|_| Error::Storage)?;
            let (cursor, generation): (Vec<u8>, Vec<u8>) = conn
                .query_row(
                    "SELECT cursor,generation FROM shared_subscriptions WHERE id=?1",
                    [sid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(db)?
                .ok_or(Error::Missing)?;
            Ok(PageFence {
                cursor: number(cursor)?,
                generation: number(generation)?,
            })
        }
        /// Metadata policy only. It never acknowledges a native pause or grants
        /// clipboard/script effects. Resume head remains a liveOnly barrier.
        pub(crate) fn policy(&self, sid: &str, policy: Policy, head: u64) -> Result<PageFence> {
            self.storage
                .shared_policy(sid, matches!(policy, Policy::ReceiveMetadata), head)?;
            self.fence(sid)
        }
        pub(crate) fn set_grant(&self, grant: Grant) -> Result<()> {
            for value in [&grant.environment, &grant.channel, &grant.origin] {
                id(value)?;
            }
            if grant.epoch == 0 || grant.revision == 0 {
                return Err(Error::Invalid);
            }
            let key = VerifyingKey::from_bytes(&grant.public_key).map_err(|_| Error::Grant)?;
            if key.is_weak() {
                return Err(Error::Grant);
            }
            tx(self.storage, |conn| {
                let previous:Option<(Vec<u8>,Vec<u8>,Vec<u8>,bool)>=conn.query_row("SELECT public_key,epoch,revision,authorized FROM shared_grants WHERE environment=?1 AND channel=?2 AND origin=?3",params![grant.environment,grant.channel,grant.origin],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?))).optional().map_err(db)?;
                if let Some((key, epoch, revision, active)) = previous {
                    let old_revision = number(revision)?;
                    let old_epoch = number(epoch)?;
                    if grant.revision == old_revision
                        && active
                        && key == grant.public_key
                        && old_epoch == grant.epoch
                    {
                        return Ok(());
                    }
                    if grant.revision <= old_revision || grant.epoch < old_epoch {
                        return Err(Error::Grant);
                    }
                }
                invalidate(conn, &grant.environment, &grant.channel)?;
                conn.execute("INSERT INTO shared_grants VALUES(?1,?2,?3,?4,?5,?6,1) ON CONFLICT(environment,channel,origin) DO UPDATE SET public_key=excluded.public_key,epoch=excluded.epoch,revision=excluded.revision,authorized=1",params![grant.environment,grant.channel,grant.origin,grant.public_key.as_slice(),counter(grant.epoch),counter(grant.revision)]).map_err(db)?;
                Ok(())
            })
        }
        pub(crate) fn revoke_grant(
            &self,
            environment: &str,
            channel: &str,
            origin: &str,
            revision: u64,
        ) -> Result<()> {
            for value in [environment, channel, origin] {
                id(value)?;
            }
            tx(self.storage, |conn| {
                let (old,active):(Vec<u8>,bool)=conn.query_row("SELECT revision,authorized FROM shared_grants WHERE environment=?1 AND channel=?2 AND origin=?3",params![environment,channel,origin],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
                let old = number(old)?;
                if revision == old && !active {
                    return Ok(());
                }
                if revision <= old {
                    return Err(Error::Grant);
                }
                invalidate(conn, environment, channel)?;
                conn.execute("UPDATE shared_grants SET authorized=0,revision=?4 WHERE environment=?1 AND channel=?2 AND origin=?3",params![environment,channel,origin,counter(revision)]).map_err(db)?;
                Ok(())
            })
        }
        pub(crate) fn admit_page(
            &self,
            sid: &str,
            fence: PageFence,
            entries: &[VerifiedArrival<'_>],
            now_unix_ms: u64,
        ) -> Result<PageFence> {
            if entries.len() > MAX_PAGE {
                return Err(Error::Limit);
            }
            let now = timestamp(now_unix_ms)?;
            // Each ciphertext body is serialized exactly once per receipt, not
            // also duplicated in the legacy fixture ciphertext column.
            let mut bodies = Vec::with_capacity(entries.len());
            let mut total = 0usize;
            for entry in entries {
                let body = serialized(entry.text)?;
                total = total.checked_add(body.len()).ok_or(Error::Limit)?;
                if total > MAX_BYTES {
                    return Err(Error::Limit);
                }
                bodies.push(body);
            }
            tx(self.storage, |conn| {
                let current_cursor: Vec<u8> = conn
                    .query_row(
                        "SELECT cursor FROM shared_subscriptions WHERE id=?1",
                        [sid],
                        |r| r.get(0),
                    )
                    .optional()
                    .map_err(db)?
                    .ok_or(Error::Missing)?;
                let current = number(current_cursor)?;
                // Exact whole-page response retries may have the original cursor.
                // Mixed old/new or altered duplicate pages are rejected atomically.
                let (_, _, _, _, _) = subscription(
                    conn,
                    sid,
                    PageFence {
                        cursor: current,
                        generation: fence.generation,
                    },
                )?;
                if fence.cursor != current {
                    let mut expected = fence.cursor;
                    if entries.is_empty() {
                        return Err(Error::StaleCursor);
                    }
                    for (entry, body) in entries.iter().zip(&bodies) {
                        expected = expected.checked_add(1).ok_or(Error::Exhausted)?;
                        if entry.server_sequence != expected || expected > current {
                            return Err(Error::StaleCursor);
                        }
                        current_grant(conn, entry.text, now)?;
                        let existing:Option<(Vec<u8>,Vec<u8>,bool)>=conn.query_row("SELECT envelope,sequence,authenticated FROM shared_receipts WHERE subscription=?1 AND publication=?2",params![sid,entry.text.envelope().publication_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?;
                        if existing != Some((body.clone(), counter(expected), true)) {
                            return Err(Error::Conflict);
                        }
                    }
                    return Ok(PageFence {
                        cursor: current,
                        generation: fence.generation,
                    });
                }
                let (env, channel, device, enabled, bootstrap) = subscription(conn, sid, fence)?;
                let mut last = fence.cursor;
                for (entry, body) in entries.iter().zip(&bodies) {
                    let e = entry.text.envelope();
                    if e.environment != env || e.channel_id != channel {
                        return Err(Error::Grant);
                    }
                    last = last.checked_add(1).ok_or(Error::Exhausted)?;
                    if entry.server_sequence != last {
                        return Err(Error::Invalid);
                    }
                    current_grant(conn, entry.text, now)?;
                    let epoch = wire::counter(&e.key_epoch).map_err(|_| Error::Invalid)?;
                    let ordinal = wire::counter(&e.origin_ordinal).map_err(|_| Error::Invalid)?;
                    let previous:Option<Vec<u8>>=conn.query_row("SELECT ordinal FROM shared_replay WHERE environment=?1 AND channel=?2 AND origin=?3 AND epoch=?4",params![env,channel,e.device_id,counter(epoch)],|r|r.get(0)).optional().map_err(db)?;
                    if previous
                        .map(number)
                        .transpose()?
                        .is_some_and(|old| ordinal <= old)
                    {
                        return Err(Error::Replay);
                    }
                    // This label records signed sender intent and local sequence
                    // classification only. VerifiedText does not prove a valid
                    // issuer lease or elapsed/native fences: never use this DB
                    // label as permission for clipboard or action execution.
                    let delivery = if !enabled || last <= bootstrap {
                        "recovery"
                    } else {
                        match e.freshness {
                            Freshness::Deferred => "deferred",
                            Freshness::Live { .. } => "live",
                        }
                    };
                    conn.execute("INSERT INTO shared_receipts(subscription,publication,sequence,generation,envelope,ciphertext,acquisition,delivery,self_origin,expires_at,authenticated) VALUES(?1,?2,?3,?4,?5,NULL,'ready',?6,?7,?8,1)",params![sid,e.publication_id,counter(last),counter(fence.generation),body,delivery,e.device_id==device,timestamp(wire::counter(&e.expires_at_unix_ms).map_err(|_|Error::Invalid)?)?]).map_err(|_|Error::Conflict)?;
                    conn.execute("INSERT INTO shared_replay VALUES(?1,?2,?3,?4,?5) ON CONFLICT(environment,channel,origin,epoch) DO UPDATE SET ordinal=excluded.ordinal",params![env,channel,e.device_id,counter(epoch),counter(ordinal)]).map_err(db)?;
                }
                conn.execute(
                    "UPDATE shared_subscriptions SET cursor=?2 WHERE id=?1",
                    params![sid, counter(last)],
                )
                .map_err(db)?;
                Ok(PageFence {
                    cursor: last,
                    generation: fence.generation,
                })
            })
        }
        /// Built-in history only, with one automatic attempt/report transaction.
        /// No capture bookkeeping, native claims, plaintext caller or replay API.
        pub(crate) fn history_import(
            &self,
            sid: &str,
            fence: PageFence,
            text: &VerifiedText,
            attempt: &str,
            now_unix_ms: u64,
        ) -> Result<HistoryOutcome> {
            id(attempt)?;
            let now = timestamp(now_unix_ms)?;
            let body = serialized(text)?;
            let normalized = normalize_text_for_storage(text.text());
            if normalized.is_empty() {
                return Err(Error::Invalid);
            }
            let hash = hash_text(&normalized);
            let outcome = tx(self.storage, |conn| {
                let (env, channel, device, enabled, _) = subscription(conn, sid, fence)?;
                let e = text.envelope();
                if env != e.environment || channel != e.channel_id || device == e.device_id {
                    return Err(Error::Grant);
                }
                current_grant(conn, text, now)?;
                let (stored,sequence,generation,authenticated,acquisition,delivery,history,item,reason):(Option<Vec<u8>>,Vec<u8>,Vec<u8>,bool,String,String,String,Option<i64>,Option<String>)=conn.query_row("SELECT envelope,sequence,generation,authenticated,acquisition,delivery,history_outcome,local_item_id,history_reason FROM shared_receipts WHERE subscription=?1 AND publication=?2",params![sid,e.publication_id],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?,r.get(3)?,r.get(4)?,r.get(5)?,r.get(6)?,r.get(7)?,r.get(8)?))).optional().map_err(db)?.ok_or(Error::Missing)?;
                if stored.as_deref() != Some(body.as_slice())
                    || !authenticated
                    || acquisition != "ready"
                    || number(generation)? != fence.generation
                {
                    return Err(Error::Ineligible);
                }
                let existing:Option<(String,String,Vec<u8>)>=conn.query_row("SELECT publication,outcome,generation FROM shared_attempts WHERE id=?1 AND subscription=?2 AND sink='history' AND manual=0",params![attempt,sid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?;
                if let Some((publication, outcome, generation)) = existing {
                    if publication != e.publication_id || number(generation)? != fence.generation {
                        return Err(Error::Conflict);
                    }
                    return match (outcome.as_str(), history.as_str(), reason.as_deref()) {
                        ("applied", "applied", _) => {
                            Ok((HistoryOutcome::Applied { item }, false, None))
                        }
                        ("failed", "failed", Some("missingFolder")) => {
                            Ok((HistoryOutcome::MissingFolder, false, None))
                        }
                        _ => Err(Error::Conflict),
                    };
                }
                let (history_enabled, folder): (bool, Option<i64>) = conn
                    .query_row(
                        "SELECT history_enabled,folder_id FROM shared_subscriptions WHERE id=?1",
                        [sid],
                        |r| Ok((r.get(0)?, r.get(1)?)),
                    )
                    .map_err(db)?;
                if !enabled || !history_enabled || delivery != "live" || history != "pending" {
                    return Err(Error::Ineligible);
                }
                let high:Option<Vec<u8>>=conn.query_row("SELECT sequence FROM shared_effect_water WHERE subscription=?1 AND sink='history'",[sid],|r|r.get(0)).optional().map_err(db)?;
                let seq = number(sequence.clone())?;
                if high.map(number).transpose()?.is_some_and(|h| seq <= h) {
                    return Err(Error::Ineligible);
                }
                let missing = if let Some(folder) = folder {
                    !conn
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM folders WHERE id=?1)",
                            [folder],
                            |r| r.get::<_, bool>(0),
                        )
                        .map_err(db)?
                } else {
                    false
                };
                let (result, created, prune) = if missing {
                    conn.execute("UPDATE shared_receipts SET history_outcome='failed',history_reason='missingFolder' WHERE subscription=?1 AND publication=?2",params![sid,e.publication_id]).map_err(db)?;
                    (HistoryOutcome::MissingFolder, false, None)
                } else {
                    let existing: Option<i64> = conn
                        .query_row(
                            "SELECT id FROM clipboard_items WHERE normalized_hash=?1",
                            [&hash],
                            |r| r.get(0),
                        )
                        .optional()
                        .map_err(db)?;
                    let item = match existing {
                        Some(i) => i,
                        None => {
                            conn.execute("INSERT INTO clipboard_items(content_kind,text,normalized_hash,created_at_unix_ms,last_used_at_unix_ms,last_copied_at_unix_ms,copy_count,mime_primary,folder_id) VALUES('text',?1,?2,?3,?3,NULL,0,'text/plain',?4)",params![text.text(),hash,now,folder]).map_err(db)?;
                            conn.last_insert_rowid()
                        }
                    };
                    conn.execute("UPDATE shared_receipts SET history_outcome='applied',local_item_id=?3 WHERE subscription=?1 AND publication=?2",params![sid,e.publication_id,item]).map_err(db)?;
                    (
                        HistoryOutcome::Applied { item: Some(item) },
                        existing.is_none(),
                        Some(prune_history_from_conn(conn).map_err(|_| Error::Storage)?),
                    )
                };
                let status = if missing { "failed" } else { "applied" };
                conn.execute("INSERT INTO shared_attempts(id,subscription,publication,generation,sink,manual,outcome,report) VALUES(?1,?2,?3,?4,'history',0,?5,'pending')",params![attempt,sid,e.publication_id,counter(fence.generation),status]).map_err(|_|Error::Conflict)?;
                conn.execute("INSERT INTO shared_effect_water VALUES(?1,'history',?2) ON CONFLICT(subscription,sink) DO UPDATE SET sequence=excluded.sequence",params![sid,sequence]).map_err(db)?;
                Ok((result, created, prune))
            })?;
            if outcome.1 || outcome.2.as_ref().is_some_and(|p| p.removed_items > 0) {
                self.storage.bump_mutation_epoch();
            }
            if let Some(prune) = outcome.2 {
                self.storage.remove_blob_paths(prune.blob_paths);
            }
            Ok(outcome.0)
        }
        pub(crate) fn report_pending(&self, sid: &str) -> Result<Vec<PendingReport>> {
            id(sid)?;
            let conn = self.storage.conn.lock().map_err(|_| Error::Storage)?;
            let exists: bool = conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM shared_subscriptions WHERE id=?1)",
                    [sid],
                    |r| r.get(0),
                )
                .map_err(db)?;
            if !exists {
                return Err(Error::Missing);
            }
            let mut statement=conn.prepare("SELECT s.environment,s.channel,s.device,a.id,a.publication,a.sink,a.outcome FROM shared_attempts a JOIN shared_subscriptions s ON s.id=a.subscription JOIN shared_receipts r ON r.subscription=a.subscription AND r.publication=a.publication WHERE s.id=?1 AND r.authenticated=1 AND a.report='pending' AND a.outcome!='claimed' ORDER BY a.id LIMIT 50").map_err(db)?;
            let result = statement
                .query_map([sid], |r| {
                    Ok(PendingReport {
                        environment: r.get(0)?,
                        channel: r.get(1)?,
                        device: r.get(2)?,
                        attempt_id: r.get(3)?,
                        publication_id: r.get(4)?,
                        sink: r.get(5)?,
                        outcome: r.get(6)?,
                    })
                })
                .map_err(db)?
                .collect::<std::result::Result<Vec<_>, _>>()
                .map_err(db)?;
            Ok(result)
        }
        /// Called only after a matching authenticated transport acknowledgment.
        /// Host metadata operation; never accepts a runner permission or causes
        /// a history import/native effect, including idempotent acknowledgment.
        pub(crate) fn ack_report(&self, sid: &str, attempt: &str) -> Result<()> {
            id(sid)?;
            id(attempt)?;
            tx(self.storage, |conn| {
                let state:Option<(String,String,bool)>=conn.query_row("SELECT a.outcome,a.report,r.authenticated FROM shared_attempts a JOIN shared_receipts r ON r.subscription=a.subscription AND r.publication=a.publication WHERE a.id=?1 AND a.subscription=?2",params![attempt,sid],|r|Ok((r.get(0)?,r.get(1)?,r.get(2)?))).optional().map_err(db)?;
                let Some((outcome, report, authenticated)) = state else {
                    return Err(Error::Missing);
                };
                if !authenticated || outcome == "claimed" {
                    return Err(Error::Ineligible);
                }
                if report == "ack" {
                    return Ok(());
                }
                if report != "pending" {
                    return Err(Error::Ineligible);
                }
                conn.execute("UPDATE shared_attempts SET report='ack' WHERE id=?1 AND subscription=?2 AND report='pending'",params![attempt,sid]).map_err(db)?;
                Ok(())
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        path::PathBuf,
        sync::atomic::{AtomicU64, Ordering},
    };
    struct Fixture {
        dir: PathBuf,
        storage: Option<AppStorage>,
    }
    impl Fixture {
        fn new() -> Self {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "copicu-shared-d1-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            assert!(!dir.exists());
            let storage = AppStorage::open(&dir).unwrap();
            storage.conn.lock().unwrap().execute_batch(SCHEMA).unwrap();
            Self {
                dir,
                storage: Some(storage),
            }
        }
        fn storage(&self) -> &AppStorage {
            self.storage.as_ref().unwrap()
        }
        fn reopen(&mut self) {
            self.storage.take();
            self.storage = Some(AppStorage::open(&self.dir).unwrap());
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            self.storage.take();
            // Exact exclusive fixture directory, never a supplied/profile path.
            if let (Ok(target), Ok(root)) =
                (self.dir.canonicalize(), std::env::temp_dir().canonicalize())
            {
                if target.starts_with(&root)
                    && target != root
                    && target.file_name() == self.dir.file_name()
                {
                    let _ = std::fs::remove_dir_all(target);
                }
            }
        }
    }
    fn scope() -> Scope {
        Scope {
            environment: "test".into(),
            channel: "channel-A".into(),
            device: "device-A".into(),
        }
    }
    fn setup(storage: &AppStorage, folder: Option<i64>) -> u64 {
        storage
            .shared_subscribe("sub-A", &scope(), 0, true, folder)
            .unwrap();
        storage.shared_policy("sub-A", true, 0).unwrap()
    }
    fn arrival(publication: &str, sequence: u64, acquisition: Acquisition) -> Arrival {
        Arrival {
            publication: publication.into(),
            sequence,
            origin: "device-B".into(),
            envelope: vec![0x91, sequence as u8],
            ciphertext: (acquisition != Acquisition::PendingFetch)
                .then(|| vec![0xa7, sequence as u8]),
            acquisition,
            delivery: Delivery::Live,
            expires_at: 1000,
        }
    }
    fn scalar<T: rusqlite::types::FromSql>(storage: &AppStorage, sql: &str) -> T {
        storage
            .conn
            .lock()
            .unwrap()
            .query_row(sql, [], |r| r.get(0))
            .unwrap()
    }
    // Ordinary tests model a request dispatched in the current generation.
    // The late-response regression below retains the explicit earlier fence.
    fn fence(storage: &AppStorage, cursor: u64) -> PageFence {
        PageFence {
            cursor,
            generation: number(scalar(
                storage,
                "SELECT generation FROM shared_subscriptions WHERE id='sub-A'",
            ))
            .unwrap(),
        }
    }
    #[test]
    fn immutable_outbox_survives_restart_and_retry_before_expiry() {
        let mut f = Fixture::new();
        let s = f.storage();
        let r = s.shared_reserve("pub-A", &scope()).unwrap();
        assert_eq!(r.ordinal, 1);
        s.shared_queue(&r, b"opaque-envelope", b"opaque-ciphertext", 100, 0)
            .unwrap();
        assert_eq!(
            s.shared_queue(&r, b"opaque-envelope", b"changed", 100, 0),
            Err(Error::Conflict)
        );
        let second = s.shared_reserve("pub-B", &scope()).unwrap();
        assert_eq!(second.ordinal, 2);
        f.reopen();
        let s = f.storage();
        assert_eq!(s.shared_reserve("pub-A", &scope()).unwrap(), r);
        s.shared_queue(&r, b"opaque-envelope", b"opaque-ciphertext", 100, 999)
            .unwrap();
        s.shared_accept("pub-A", u64::MAX).unwrap();
        s.shared_accept("pub-A", u64::MAX).unwrap();
        assert_eq!(s.shared_accept("pub-A", 9), Err(Error::Conflict));
        assert_eq!(
            scalar::<Vec<u8>>(
                s,
                "SELECT ciphertext FROM shared_outbox WHERE publication='pub-A'"
            ),
            b"opaque-ciphertext"
        );
    }
    #[test]
    fn reservation_scope_and_counter_exhaustion_are_transactional() {
        let f = Fixture::new();
        let s = f.storage();
        let r = s.shared_reserve("pub-A", &scope()).unwrap();
        let mut wrong = scope();
        wrong.environment = "other".into();
        assert_eq!(s.shared_reserve("pub-A", &wrong), Err(Error::Conflict));
        s.conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE shared_ordinals SET last_ordinal=?1",
                [counter(u64::MAX)],
            )
            .unwrap();
        assert_eq!(s.shared_reserve("pub-B", &scope()), Err(Error::Exhausted));
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_outbox"), 1);
        s.shared_queue(&r, b"e", b"c", 10, 0).unwrap();
    }
    #[test]
    fn page_cursor_rolls_back_collision_and_invalid_tail() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        let page = [
            arrival("pub-A", 1, Acquisition::PendingFetch),
            arrival("pub-A", 2, Acquisition::Ready),
        ];
        assert_eq!(
            s.shared_store_page("sub-A", fence(s, 0), &page),
            Err(Error::Conflict)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"), 0);
        assert_eq!(
            number(scalar(s, "SELECT cursor FROM shared_subscriptions")).unwrap(),
            0
        );
        assert_eq!(
            s.shared_store_page(
                "sub-A",
                fence(s, 0),
                &[
                    arrival("pub-A", 1, Acquisition::Ready),
                    arrival("pub-B", 3, Acquisition::Ready)
                ]
            ),
            Err(Error::Invalid)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"), 0);
    }
    #[test]
    fn pending_resolution_preserves_original_delivery_and_generation() {
        let mut f = Fixture::new();
        let s = f.storage();
        let generation = setup(s, None);
        let mut pending = arrival("pub-A", 1, Acquisition::PendingFetch);
        pending.delivery = Delivery::Recovery;
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[pending, arrival("pub-B", 2, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-B", "attempt-B", 0).unwrap();
        f.reopen();
        let s = f.storage();
        s.shared_resolve(
            "sub-A",
            "pub-A",
            Acquisition::PendingKey,
            Some(b"opaque-fetched"),
        )
        .unwrap();
        s.shared_resolve(
            "sub-A",
            "pub-A",
            Acquisition::Ready,
            Some(b"opaque-fetched"),
        )
        .unwrap();
        assert_eq!(
            scalar::<String>(
                s,
                "SELECT delivery FROM shared_receipts WHERE publication='pub-A'"
            ),
            "recovery"
        );
        assert_eq!(
            number(scalar(
                s,
                "SELECT generation FROM shared_receipts WHERE publication='pub-A'"
            ))
            .unwrap(),
            generation
        );
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-A", 0),
            Err(Error::Ineligible)
        );
        assert_eq!(
            s.shared_resolve("sub-A", "pub-A", Acquisition::Ready, Some(b"replacement")),
            Err(Error::Conflict)
        );
        assert_eq!(
            s.shared_store_page("sub-A", fence(s, 0), &[]),
            Err(Error::StaleCursor)
        );
    }
    #[test]
    fn large_u64_sequences_order_without_signed_or_float_casts() {
        let f = Fixture::new();
        let s = f.storage();
        let head = i64::MAX as u64;
        s.shared_subscribe("sub-A", &scope(), head, true, None)
            .unwrap();
        s.shared_policy("sub-A", true, head).unwrap();
        s.shared_store_page(
            "sub-A",
            fence(s, head),
            &[
                arrival("pub-A", head + 1, Acquisition::Ready),
                arrival("pub-B", head + 2, Acquisition::Ready),
            ],
        )
        .unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-A", 0),
            Err(Error::Ineligible)
        );
        s.shared_claim("sub-A", "pub-B", "attempt-B", 0).unwrap();
        assert_eq!(
            number(scalar(s, "SELECT MAX(sequence) FROM shared_receipts")).unwrap(),
            head + 2
        );
        let conn = s.conn.lock().unwrap();
        assert!(conn
            .execute("UPDATE shared_subscriptions SET cursor='00000000'", [])
            .is_err());
    }
    #[test]
    fn pause_recovery_and_deferred_never_rejuvenate_effects() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_policy("sub-A", false, 1).unwrap();
        s.shared_policy("sub-A", true, 1).unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-A", 0),
            Err(Error::Ineligible)
        );
        let mut deferred = arrival("pub-B", 2, Acquisition::Ready);
        deferred.delivery = Delivery::Deferred;
        s.shared_store_page("sub-A", fence(s, 1), &[deferred])
            .unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-B", "attempt-B", 0),
            Err(Error::Ineligible)
        );
        assert_eq!(s.shared_policy("sub-A", true, 0), Err(Error::StaleCursor));
    }
    #[test]
    fn durable_claim_crash_is_uncertain_and_report_ack_does_not_reexecute() {
        let mut f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-A", "attempt-A", 0).unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-B", 0),
            Err(Error::Conflict)
        );
        f.reopen();
        let s = f.storage();
        assert_eq!(s.shared_recover("sub-A", true).unwrap(), 1);
        assert_eq!(
            scalar::<String>(s, "SELECT outcome FROM shared_attempts"),
            "uncertain"
        );
        assert_eq!(
            scalar::<String>(s, "SELECT report FROM shared_attempts"),
            "pending"
        );
        assert_eq!(
            s.shared_finish("sub-A", "attempt-A", Outcome::Applied),
            Err(Error::Conflict)
        );
        s.shared_ack_report("sub-A", "attempt-A").unwrap();
        s.shared_ack_report("sub-A", "attempt-A").unwrap();
        s.shared_finish("sub-A", "attempt-A", Outcome::Uncertain)
            .unwrap();
        assert_eq!(
            scalar::<String>(s, "SELECT report FROM shared_attempts"),
            "ack"
        );
        s.shared_policy("sub-A", true, 1).unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-C", 0),
            Err(Error::Conflict)
        );
    }
    #[test]
    fn reported_outcome_is_stable_across_restart_and_pending_ack() {
        let mut f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-A", "attempt-A", 0).unwrap();
        s.shared_finish("sub-A", "attempt-A", Outcome::Applied)
            .unwrap();
        f.reopen();
        let s = f.storage();
        assert_eq!(s.shared_recover("sub-A", true).unwrap(), 0);
        assert_eq!(
            scalar::<String>(s, "SELECT outcome FROM shared_attempts"),
            "applied"
        );
        assert_eq!(
            scalar::<String>(s, "SELECT report FROM shared_attempts"),
            "pending"
        );
        assert_eq!(
            s.shared_finish("sub-A", "attempt-A", Outcome::Failed),
            Err(Error::Conflict)
        );
    }
    #[test]
    fn import_dedupes_without_moving_metadata_or_capture_bookkeeping() {
        let f = Fixture::new();
        let s = f.storage();
        let local = s.create_folder(None, "Local").unwrap();
        let remote = s.create_folder(None, "Remote").unwrap();
        s.set_capture_folder_destination(Some(local.id), true)
            .unwrap();
        let item = s.insert_text("same", &hash_text("same")).unwrap();
        s.conn.lock().unwrap().execute("UPDATE clipboard_items SET title='mine',notes='notes',is_marked=1,is_inbox=1 WHERE id=?1",[item]).unwrap();
        let copies = s.get_item(item).unwrap().copy_count;
        let captures = scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_item_capture_events");
        let generation = setup(s, Some(remote.id));
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[
                arrival("pub-A", 1, Acquisition::Ready),
                arrival("pub-B", 2, Acquisition::Ready),
            ],
        )
        .unwrap();
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-A", generation, "same", 0)
                .unwrap(),
            item
        );
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-B", generation, "same", 0)
                .unwrap(),
            item
        );
        let after = s.get_item(item).unwrap();
        assert_eq!(after.folder_id, Some(local.id));
        assert_eq!(after.title.as_deref(), Some("mine"));
        assert_eq!(after.notes.as_deref(), Some("notes"));
        assert!(after.is_marked && after.is_inbox);
        assert_eq!(after.copy_count, copies);
        assert_eq!(
            scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_item_capture_events"),
            captures
        );
        assert_eq!(s.get_capture_folder_destination().unwrap(), Some(local.id));
        assert!(s.get_capture_folder_destination_state().unwrap().armed);
        assert_eq!(
            scalar::<i64>(
                s,
                "SELECT COUNT(*) FROM shared_receipts WHERE local_item_id IS NOT NULL"
            ),
            2
        );
    }
    #[test]
    fn new_import_delete_and_edit_keep_opaque_receipt_independent() {
        let f = Fixture::new();
        let s = f.storage();
        let folder = s.create_folder(None, "Remote").unwrap();
        let generation = setup(s, Some(folder.id));
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        let item = s
            .shared_import_fixture("sub-A", "pub-A", generation, "original synthetic text", 0)
            .unwrap();
        assert_eq!(s.get_item(item).unwrap().copy_count, 0);
        assert_eq!(s.get_item(item).unwrap().folder_id, Some(folder.id));
        s.conn
            .lock()
            .unwrap()
            .execute(
                "UPDATE clipboard_items SET text='edited' WHERE id=?1",
                [item],
            )
            .unwrap();
        assert_eq!(
            scalar::<Vec<u8>>(s, "SELECT ciphertext FROM shared_receipts"),
            vec![0xa7, 1]
        );
        s.delete_folder(folder.id, true, true).unwrap();
        assert_eq!(
            scalar::<Option<i64>>(s, "SELECT local_item_id FROM shared_receipts"),
            None
        );
        assert_eq!(
            scalar::<String>(s, "SELECT history_outcome FROM shared_receipts"),
            "applied"
        );
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-A", generation, "original synthetic text", 0),
            Err(Error::Ineligible)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_items"), 0);
    }
    #[test]
    fn missing_folder_denies_import_without_reroute_or_losing_receipt() {
        let f = Fixture::new();
        let s = f.storage();
        let folder = s.create_folder(None, "Remote").unwrap();
        let generation = setup(s, Some(folder.id));
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.delete_folder(folder.id, false, false).unwrap();
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-A", generation, "fixture", 0),
            Err(Error::MissingFolder)
        );
        assert_eq!(
            scalar::<i64>(s, "SELECT folder_id FROM shared_subscriptions"),
            folder.id
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_items"), 0);
        assert_eq!(
            scalar::<String>(s, "SELECT history_outcome FROM shared_receipts"),
            "failed"
        );
        assert_eq!(
            scalar::<String>(s, "SELECT history_reason FROM shared_receipts"),
            "missingFolder"
        );
        s.shared_claim("sub-A", "pub-A", "attempt-A", 0).unwrap();
    }
    #[test]
    fn candidate_schema_is_absent_from_normal_migrations() {
        let mut conn = Connection::open_in_memory().unwrap();
        super::super::MIGRATIONS.to_latest(&mut conn).unwrap();
        assert_eq!(
            conn.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE name LIKE 'shared_%'",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            0
        );
    }
    #[test]
    fn pending_quota_rejects_whole_page_without_advancing_cursor() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        for cursor in [0, 50] {
            let page = ((cursor + 1)..=(cursor + 50))
                .map(|sequence| {
                    arrival(
                        &format!("pub-{sequence}"),
                        sequence,
                        Acquisition::PendingFetch,
                    )
                })
                .collect::<Vec<_>>();
            s.shared_store_page("sub-A", fence(s, cursor), &page)
                .unwrap();
        }
        assert_eq!(
            s.shared_store_page(
                "sub-A",
                fence(s, 100),
                &[arrival("pub-101", 101, Acquisition::PendingFetch)]
            ),
            Err(Error::Limit)
        );
        assert_eq!(
            number(scalar(s, "SELECT cursor FROM shared_subscriptions")).unwrap(),
            100
        );
        assert_eq!(
            scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"),
            100
        );
        s.shared_resolve("sub-A", "pub-1", Acquisition::Rejected, None)
            .unwrap();
        s.shared_store_page(
            "sub-A",
            fence(s, 100),
            &[arrival("pub-101", 101, Acquisition::PendingFetch)],
        )
        .unwrap();
    }
    #[test]
    fn self_origin_expiry_and_changed_generation_deny_automatic_claims() {
        let f = Fixture::new();
        let s = f.storage();
        let generation = setup(s, None);
        let mut own = arrival("pub-own", 1, Acquisition::Ready);
        own.origin = "device-A".into();
        s.shared_store_page("sub-A", fence(s, 0), &[own]).unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-own", "attempt-own", 0),
            Err(Error::Ineligible)
        );
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-own", generation, "fixture", 0),
            Err(Error::Ineligible)
        );
        s.shared_store_page(
            "sub-A",
            fence(s, 1),
            &[arrival("pub-expired", 2, Acquisition::Ready)],
        )
        .unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-expired", "attempt-expired", 1000),
            Err(Error::Ineligible)
        );
        s.shared_policy("sub-A", false, 2).unwrap();
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-expired", generation, "fixture", 0),
            Err(Error::Ineligible)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_attempts"), 0);
    }
    #[test]
    fn late_page_from_previous_generation_cannot_be_reclassified_live() {
        let f = Fixture::new();
        let s = f.storage();
        let original_generation = setup(s, None);
        let request = PageFence {
            cursor: 0,
            generation: original_generation,
        };
        s.shared_policy("sub-A", false, 0).unwrap();
        s.shared_policy("sub-A", true, 0).unwrap();
        assert_eq!(
            s.shared_store_page("sub-A", request, &[arrival("pub-A", 1, Acquisition::Ready)]),
            Err(Error::StaleGeneration)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"), 0);
        assert_eq!(
            number(scalar(s, "SELECT cursor FROM shared_subscriptions")).unwrap(),
            0
        );
        assert_eq!(
            s.shared_claim("sub-A", "pub-A", "attempt-A", 0),
            Err(Error::Ineligible)
        );
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-B", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-B", "attempt-B", 0).unwrap();
    }
    #[test]
    fn recovery_without_stopped_executor_proof_cannot_settle_or_resume() {
        let f = Fixture::new();
        let s = f.storage();
        let generation = setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-A", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-A", "attempt-A", 0).unwrap();
        assert_eq!(s.shared_recover("sub-A", false), Err(Error::Ineligible));
        assert_eq!(
            number(scalar(s, "SELECT generation FROM shared_subscriptions")).unwrap(),
            generation
        );
        assert!(scalar::<bool>(
            s,
            "SELECT enabled FROM shared_subscriptions"
        ));
        assert_eq!(
            scalar::<String>(s, "SELECT outcome FROM shared_attempts"),
            "claimed"
        );
        assert_eq!(
            scalar::<String>(s, "SELECT report FROM shared_attempts"),
            "none"
        );
        s.shared_finish("sub-A", "attempt-A", Outcome::Applied)
            .unwrap();
    }
    #[test]
    fn retention_gap_is_explicit_idempotent_fenced_and_backlog_is_recovery() {
        let mut f = Fixture::new();
        let s = f.storage();
        let generation = setup(s, None);
        let old = PageFence {
            cursor: 0,
            generation,
        };
        let next = s.shared_retention_gap("sub-A", "gap_A", old, 5, 8).unwrap();
        assert_eq!(next.cursor, 4);
        assert_eq!(next.generation, generation + 1);
        assert_eq!(
            s.shared_retention_gap("sub-A", "gap_A", old, 5, 8).unwrap(),
            next
        );
        assert_eq!(
            s.shared_retention_gap("sub-A", "gap_A", old, 6, 8),
            Err(Error::Conflict)
        );
        assert_eq!(
            s.shared_store_page("sub-A", old, &[arrival("old", 1, Acquisition::Ready)]),
            Err(Error::StaleCursor)
        );
        s.shared_store_page("sub-A", next, &[arrival("pub-5", 5, Acquisition::Ready)])
            .unwrap();
        assert_eq!(
            scalar::<String>(s, "SELECT delivery FROM shared_receipts"),
            "recovery"
        );
        assert_eq!(
            s.shared_claim("sub-A", "pub-5", "attempt-5", 0),
            Err(Error::Ineligible)
        );
        f.reopen();
        let s = f.storage();
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_gaps"), 1);
        assert_eq!(
            number(scalar(
                s,
                "SELECT retention_floor FROM shared_subscriptions"
            ))
            .unwrap(),
            5
        );
    }
    #[test]
    fn retention_gap_cannot_invalidate_a_claimed_executor_or_stale_generation() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        let stale = fence(s, 0);
        s.shared_policy("sub-A", true, 0).unwrap();
        assert_eq!(
            s.shared_retention_gap("sub-A", "gap-stale", stale, 3, 3),
            Err(Error::StaleGeneration)
        );
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-1", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-1", "attempt-1", 0).unwrap();
        assert_eq!(
            s.shared_retention_gap("sub-A", "gap-active", fence(s, 1), 3, 3),
            Err(Error::Ineligible)
        );
        assert_eq!(
            number(scalar(s, "SELECT cursor FROM shared_subscriptions")).unwrap(),
            1
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_gaps"), 0);
    }
    #[test]
    fn outbox_fifo_scope_final_states_and_expiry_survive_restart() {
        let mut f = Fixture::new();
        let s = f.storage();
        let first = s.shared_reserve("pub_first", &scope()).unwrap();
        let second = s.shared_reserve("pub_second", &scope()).unwrap();
        s.shared_queue(&second, b"e2", b"c2", 100, 0).unwrap();
        assert_eq!(s.shared_next_queued(&scope(), 0).unwrap(), None);
        s.shared_outbox_final("pub_first", &scope(), OutboxFinal::Cancelled, false, 0)
            .unwrap();
        assert_eq!(
            s.shared_next_queued(&scope(), 0).unwrap(),
            Some(second.clone())
        );
        assert_eq!(
            s.shared_next_queued(&scope(), 0).unwrap(),
            Some(second.clone())
        );
        let mut other = scope();
        other.channel = "other-channel".into();
        assert_eq!(s.shared_next_queued(&other, 0).unwrap(), None);
        assert_eq!(s.shared_next_queued(&scope(), 100).unwrap(), None);
        assert_eq!(
            s.shared_queue(&second, b"e2", b"c2", 100, 200),
            Err(Error::Ineligible)
        );
        assert_eq!(
            s.shared_queue(&first, b"e1", b"c1", 100, 0),
            Err(Error::Conflict)
        );
        let rejected = s.shared_reserve("pub_rejected", &scope()).unwrap();
        s.shared_outbox_final(
            &rejected.publication,
            &scope(),
            OutboxFinal::Rejected,
            false,
            0,
        )
        .unwrap();
        f.reopen();
        let s = f.storage();
        assert_eq!(
            scalar::<String>(
                s,
                "SELECT state FROM shared_outbox WHERE publication='pub_second'"
            ),
            "expired"
        );
        assert!(scalar::<bool>(
            s,
            "SELECT commit_ambiguous FROM shared_outbox WHERE publication='pub_second'"
        ));
        assert_eq!(
            scalar::<Vec<u8>>(
                s,
                "SELECT ciphertext FROM shared_outbox WHERE publication='pub_second'"
            ),
            b"c2"
        );
        assert_eq!(s.shared_reserve("pub_second", &scope()).unwrap(), second);
    }
    #[test]
    fn ready_candidate_is_not_blocked_by_pending_rejected_self_or_deferred_tail() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        let ready = arrival("ready", 1, Acquisition::Ready);
        let pending = arrival("pending", 2, Acquisition::PendingKey);
        let rejected = arrival("rejected", 3, Acquisition::Rejected);
        let mut own = arrival("own", 4, Acquisition::Ready);
        own.origin = "device-A".into();
        let mut deferred = arrival("deferred", 5, Acquisition::Ready);
        deferred.delivery = Delivery::Deferred;
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[ready, pending, rejected, own, deferred],
        )
        .unwrap();
        s.shared_claim("sub-A", "ready", "attempt-ready", 0)
            .unwrap();
        s.shared_finish("sub-A", "attempt-ready", Outcome::Failed)
            .unwrap();
        s.shared_resolve("sub-A", "pending", Acquisition::Ready, Some(&[0xa7, 2]))
            .unwrap();
        s.shared_claim("sub-A", "pending", "attempt-pending", 0)
            .unwrap();
        s.shared_finish("sub-A", "attempt-pending", Outcome::Skipped)
            .unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "ready", "late-ready", 0),
            Err(Error::Conflict)
        );
        assert_eq!(
            number(scalar(
                s,
                "SELECT sequence FROM shared_effect_water WHERE sink='clipboard'"
            ))
            .unwrap(),
            2
        );
    }
    #[test]
    fn independent_sinks_and_manual_intention_never_reopen_automatic_claim() {
        let mut f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-1", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.shared_claim("sub-A", "pub-1", "auto-clip", 0).unwrap();
        s.shared_claim_sink(
            "sub-A",
            "pub-1",
            "auto-history",
            Sink::History,
            AttemptMode::Automatic,
            0,
        )
        .unwrap();
        s.shared_claim_sink(
            "sub-A",
            "pub-1",
            "auto-action",
            Sink::Action,
            AttemptMode::Automatic,
            0,
        )
        .unwrap();
        assert_eq!(
            s.shared_claim_sink(
                "sub-A",
                "pub-1",
                "manual-active",
                Sink::Clipboard,
                AttemptMode::Manual,
                0
            ),
            Err(Error::Ineligible)
        );
        s.shared_finish("sub-A", "auto-clip", Outcome::Uncertain)
            .unwrap();
        s.shared_claim_sink(
            "sub-A",
            "pub-1",
            "manual-clip",
            Sink::Clipboard,
            AttemptMode::Manual,
            0,
        )
        .unwrap();
        s.shared_finish("sub-A", "manual-clip", Outcome::Applied)
            .unwrap();
        assert_eq!(
            s.shared_claim("sub-A", "pub-1", "auto-retry", 0),
            Err(Error::Conflict)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_attempts"), 4);
        f.reopen();
        let s = f.storage();
        assert_eq!(
            number(scalar(
                s,
                "SELECT sequence FROM shared_effect_water WHERE sink='clipboard'"
            ))
            .unwrap(),
            1
        );
        assert_eq!(
            scalar::<String>(
                s,
                "SELECT outcome FROM shared_attempts WHERE id='auto-clip'"
            ),
            "uncertain"
        );
    }
    #[test]
    fn payload_pruning_protects_active_and_pending_report_and_keeps_tombstones() {
        let mut f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        let mut body_in_envelope = arrival("pub-1", 1, Acquisition::Ready);
        body_in_envelope.envelope =
            b"opaque-header-with-embedded-ciphertext-SENTINEL-BODY".to_vec();
        s.shared_store_page("sub-A", fence(s, 0), &[body_in_envelope])
            .unwrap();
        s.shared_claim("sub-A", "pub-1", "attempt-1", 0).unwrap();
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 0).unwrap(), 0);
        s.shared_finish("sub-A", "attempt-1", Outcome::Applied)
            .unwrap();
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 0).unwrap(), 0);
        s.shared_ack_report("sub-A", "attempt-1").unwrap();
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 0).unwrap(), 1);
        assert_eq!(
            scalar::<Option<Vec<u8>>>(s, "SELECT ciphertext FROM shared_receipts"),
            None
        );
        assert_eq!(
            scalar::<Option<Vec<u8>>>(s, "SELECT envelope FROM shared_receipts"),
            None
        );
        assert_eq!(
            s.shared_resolve("sub-A", "pub-1", Acquisition::Ready, Some(&[0xa7, 1])),
            Err(Error::Conflict)
        );
        assert_eq!(
            s.shared_claim_sink(
                "sub-A",
                "pub-1",
                "manual-pruned",
                Sink::Clipboard,
                AttemptMode::Manual,
                0
            ),
            Err(Error::Ineligible)
        );
        f.reopen();
        let s = f.storage();
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"), 1);
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_attempts"), 1);
        assert_eq!(
            scalar::<String>(s, "SELECT outcome FROM shared_attempts"),
            "applied"
        );
        assert_eq!(
            number(scalar(s, "SELECT sequence FROM shared_effect_water")).unwrap(),
            1
        );
    }
    #[test]
    fn failed_missing_folder_is_durable_and_does_not_automatically_retry() {
        let mut f = Fixture::new();
        let s = f.storage();
        let folder = s.create_folder(None, "Gone").unwrap();
        let generation = setup(s, Some(folder.id));
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("pub-1", 1, Acquisition::Ready)],
        )
        .unwrap();
        s.delete_folder(folder.id, false, false).unwrap();
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-1", generation, "fixture", 0),
            Err(Error::MissingFolder)
        );
        f.reopen();
        let s = f.storage();
        assert_eq!(
            scalar::<String>(s, "SELECT history_reason FROM shared_receipts"),
            "missingFolder"
        );
        assert_eq!(
            s.shared_import_fixture("sub-A", "pub-1", generation, "fixture", 0),
            Err(Error::MissingFolder)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_items"), 0);
        s.shared_claim("sub-A", "pub-1", "clip-independent", 0)
            .unwrap();
    }
    #[test]
    fn expired_pending_entries_release_quota_without_restoring_payload_after_restart() {
        let mut f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        for cursor in [0, 50] {
            let entries = ((cursor + 1)..=(cursor + 50))
                .map(|sequence| {
                    arrival(
                        &format!("pending-{sequence}"),
                        sequence,
                        if sequence % 2 == 0 {
                            Acquisition::PendingKey
                        } else {
                            Acquisition::PendingFetch
                        },
                    )
                })
                .collect::<Vec<_>>();
            s.shared_store_page("sub-A", fence(s, cursor), &entries)
                .unwrap();
        }
        assert_eq!(s.shared_prune_receipts("sub-A", 999, 0).unwrap(), 0);
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 0).unwrap(), 100);
        assert_eq!(scalar::<i64>(s,"SELECT COUNT(*) FROM shared_receipts WHERE acquisition IN ('pendingFetch','pendingKey')"),0);
        assert_eq!(scalar::<i64>(s,"SELECT COUNT(*) FROM shared_receipts WHERE envelope IS NOT NULL OR ciphertext IS NOT NULL"),0);
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 0).unwrap(), 0);
        f.reopen();
        let s = f.storage();
        assert_eq!(
            scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"),
            100
        );
        assert_eq!(
            s.shared_resolve("sub-A", "pending-1", Acquisition::Ready, Some(b"late-body")),
            Err(Error::Conflict)
        );
        let mut new = arrival("new-live", 101, Acquisition::Ready);
        new.expires_at = 2000;
        s.shared_store_page("sub-A", fence(s, 100), &[new]).unwrap();
        s.shared_claim("sub-A", "new-live", "attempt-new", 1000)
            .unwrap();
    }
    #[test]
    fn expired_history_admission_cannot_create_clip_or_convert_saved_failure_to_pending() {
        let mut f = Fixture::new();
        let s = f.storage();
        let generation = setup(s, None);
        s.shared_store_page(
            "sub-A",
            fence(s, 0),
            &[arrival("expired-body", 1, Acquisition::Ready)],
        )
        .unwrap();
        assert_eq!(
            s.shared_import_fixture("sub-A", "expired-body", generation, "synthetic text", 1000),
            Err(Error::Ineligible)
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM clipboard_items"), 0);
        f.reopen();
        let s = f.storage();
        assert_eq!(
            s.shared_import_fixture("sub-A", "expired-body", generation, "synthetic text", 1000),
            Err(Error::Ineligible)
        );
        assert_eq!(s.shared_prune_receipts("sub-A", 1000, 50).unwrap(), 1);
        assert_eq!(
            scalar::<String>(s, "SELECT acquisition FROM shared_receipts"),
            "expired"
        );
        assert_eq!(
            scalar::<Option<Vec<u8>>>(s, "SELECT envelope FROM shared_receipts"),
            None
        );
        assert_eq!(
            s.shared_import_fixture("sub-A", "expired-body", generation, "synthetic text", 0),
            Err(Error::Ineligible)
        );
    }
    #[test]
    fn empty_retained_channel_gap_advances_to_head_then_only_new_live_is_eligible() {
        let f = Fixture::new();
        let s = f.storage();
        setup(s, None);
        let request = fence(s, 0);
        let next = s
            .shared_retention_gap("sub-A", "gap-empty", request, 6, 5)
            .unwrap();
        assert_eq!(next.cursor, 5);
        assert_eq!(
            s.shared_retention_gap("sub-A", "gap-empty", request, 6, 5)
                .unwrap(),
            next
        );
        assert_eq!(
            number(scalar(s, "SELECT bootstrap FROM shared_subscriptions")).unwrap(),
            5
        );
        assert_eq!(scalar::<i64>(s, "SELECT COUNT(*) FROM shared_receipts"), 0);
        s.shared_store_page("sub-A", next, &[arrival("new-6", 6, Acquisition::Ready)])
            .unwrap();
        s.shared_claim("sub-A", "new-6", "attempt-6", 0).unwrap();
    }

    #[cfg(feature = "shared-clipboard")]
    mod authenticated {
        use super::*;
        use crate::shared_clipboard::{
            crypto::{self, ChannelKey, DeviceSigner, Entropy, ReceivePolicy, VerifiedText},
            wire::{Envelope, Freshness},
        };
        struct Synthetic(u8);
        impl Entropy for Synthetic {
            fn fill(&mut self, b: &mut [u8]) -> crypto::Result<()> {
                b.fill(self.0);
                self.0 = self.0.wrapping_add(1);
                Ok(())
            }
        }
        fn fresh() -> Fixture {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let dir = std::env::temp_dir().join(format!(
                "copicu-shared-auth-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            assert!(!dir.exists());
            let storage = AppStorage::open(&dir).unwrap();
            Fixture {
                dir,
                storage: Some(storage),
            }
        }
        fn keys() -> (DeviceSigner, ChannelKey) {
            let mut e = Synthetic(29);
            (
                DeviceSigner::generate(&mut e).unwrap(),
                ChannelKey::generate("test".into(), "channel-A".into(), 1, &mut e).unwrap(),
            )
        }
        fn grant(signer: &DeviceSigner, revision: u64) -> Grant {
            Grant {
                environment: "test".into(),
                channel: "channel-A".into(),
                origin: "remote-B".into(),
                public_key: signer.public(),
                epoch: 1,
                revision,
            }
        }
        fn setup_auth(
            storage: &AppStorage,
            signer: &DeviceSigner,
            folder: Option<i64>,
        ) -> PageFence {
            let store = RuntimeStore::init(storage).unwrap();
            store.set_grant(grant(signer, 1)).unwrap();
            store
                .subscribe(Subscribe {
                    id: "auth".into(),
                    environment: "test".into(),
                    channel: "channel-A".into(),
                    local_device: "device-A".into(),
                    head: 0,
                    history_enabled: true,
                    folder_id: folder,
                })
                .unwrap();
            store.policy("auth", Policy::ReceiveMetadata, 0).unwrap()
        }
        fn verified(
            signer: &DeviceSigner,
            key: &ChannelKey,
            publication: &str,
            ordinal: u64,
            expires: u64,
        ) -> VerifiedText {
            verified_content(
                signer,
                key,
                publication,
                ordinal,
                expires,
                "synthetic authenticated text",
            )
        }
        fn verified_content(
            signer: &DeviceSigner,
            key: &ChannelKey,
            publication: &str,
            ordinal: u64,
            expires: u64,
            content: &str,
        ) -> VerifiedText {
            let e = Envelope {
                version: 1,
                environment: "test".into(),
                channel_id: "channel-A".into(),
                device_id: "remote-B".into(),
                publication_id: publication.into(),
                origin_ordinal: ordinal.to_string(),
                key_epoch: "1".into(),
                expires_at_unix_ms: expires.to_string(),
                freshness: Freshness::Live {
                    lease_id: "lease".into(),
                },
                nonce: vec![],
                ciphertext: vec![],
                signature: vec![],
            };
            let e = crypto::seal(e, content, key, signer, &mut Synthetic(51)).unwrap();
            crypto::open(
                &e,
                key,
                &ReceivePolicy {
                    environment: "test",
                    channel: "channel-A",
                    device: "remote-B",
                    signing_key: signer.public(),
                    epoch: 1,
                    now_unix_ms: 1,
                    last_origin_ordinal: 0,
                    live_lease: Some("lease"),
                },
            )
            .unwrap()
        }
        #[test]
        fn runtime_initialization_is_explicit_idempotent_versioned_and_fail_closed() {
            let f = fresh();
            let store = RuntimeStore::init(f.storage()).unwrap();
            drop(store);
            RuntimeStore::init(f.storage()).unwrap();
            f.storage()
                .conn
                .lock()
                .unwrap()
                .execute("UPDATE shared_runtime_version SET version=2", [])
                .unwrap();
            assert!(matches!(
                RuntimeStore::init(f.storage()),
                Err(Error::Version)
            ));
            let old = Fixture::new();
            assert!(matches!(
                RuntimeStore::init(old.storage()),
                Err(Error::Version)
            ));
        }
        #[test]
        fn current_signing_grant_revoke_and_generation_fence_are_rechecked() {
            let f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let v = verified(&signer, &key, "publication", 1, 1000);
            let store = RuntimeStore::init(f.storage()).unwrap();
            let other = DeviceSigner::generate(&mut Synthetic(91)).unwrap();
            store.set_grant(grant(&other, 2)).unwrap();
            let now_fence = store.fence("auth").unwrap();
            assert!(matches!(
                store.admit_page(
                    "auth",
                    now_fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v
                    }],
                    2
                ),
                Err(Error::Grant)
            ));
            assert!(matches!(
                store.admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v
                    }],
                    2
                ),
                Err(Error::StaleGeneration)
            ));
            store.set_grant(grant(&signer, 3)).unwrap();
            let current = store.fence("auth").unwrap();
            store
                .revoke_grant("test", "channel-A", "remote-B", 4)
                .unwrap();
            assert!(matches!(
                store.admit_page(
                    "auth",
                    current,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v
                    }],
                    2
                ),
                Err(Error::StaleGeneration)
            ));
            assert!(matches!(
                store.admit_page(
                    "auth",
                    store.fence("auth").unwrap(),
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v
                    }],
                    2
                ),
                Err(Error::Grant)
            ));
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM shared_receipts"),
                0
            );
        }
        #[test]
        fn durable_replay_collision_rolls_back_the_entire_page_and_cursor() {
            let mut f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let first = verified(&signer, &key, "first", 2, 1000);
            let stale = verified(&signer, &key, "stale", 1, 1000);
            let store = RuntimeStore::init(f.storage()).unwrap();
            assert!(matches!(
                store.admit_page(
                    "auth",
                    fence,
                    &[
                        VerifiedArrival {
                            server_sequence: 1,
                            text: &first
                        },
                        VerifiedArrival {
                            server_sequence: 2,
                            text: &stale
                        }
                    ],
                    2
                ),
                Err(Error::Replay)
            ));
            assert_eq!(store.fence("auth").unwrap(), fence);
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM shared_replay"),
                0
            );
            store
                .admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &first,
                    }],
                    2,
                )
                .unwrap();
            drop(store);
            f.reopen();
            let store = RuntimeStore::init(f.storage()).unwrap();
            let current = store.fence("auth").unwrap();
            assert!(matches!(
                store.admit_page(
                    "auth",
                    current,
                    &[VerifiedArrival {
                        server_sequence: 2,
                        text: &stale
                    }],
                    2
                ),
                Err(Error::Replay)
            ));
            assert_eq!(store.fence("auth").unwrap(), current);
        }
        #[test]
        fn duplicate_publication_retry_is_immutable_and_ciphertext_not_repeated() {
            let f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let v = verified(&signer, &key, "pub", 1, 1000);
            let store = RuntimeStore::init(f.storage()).unwrap();
            let after = store
                .admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v,
                    }],
                    2,
                )
                .unwrap();
            assert_eq!(
                store
                    .admit_page(
                        "auth",
                        fence,
                        &[VerifiedArrival {
                            server_sequence: 1,
                            text: &v
                        }],
                        2
                    )
                    .unwrap(),
                after
            );
            assert_eq!(scalar::<i64>(f.storage(),"SELECT COUNT(*) FROM shared_receipts WHERE authenticated=1 AND ciphertext IS NULL"),1);
            let changed = verified(&signer, &key, "pub", 2, 1000);
            assert!(matches!(
                store.admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &changed
                    }],
                    2
                ),
                Err(Error::Conflict)
            ));
            assert_eq!(store.fence("auth").unwrap(), after);
        }
        #[test]
        fn unsigned_timestamps_are_checked_without_loss_or_cast_and_expiry_is_current() {
            let f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let store = RuntimeStore::init(f.storage()).unwrap();
            for expires in [i64::MAX as u64 + 1, u64::MAX] {
                let v = verified(&signer, &key, "large", 1, expires);
                assert!(matches!(
                    store.admit_page(
                        "auth",
                        fence,
                        &[VerifiedArrival {
                            server_sequence: 1,
                            text: &v
                        }],
                        2
                    ),
                    Err(Error::Invalid)
                ));
            }
            let v = verified(&signer, &key, "expired", 1, 10);
            assert!(matches!(
                store.admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v
                    }],
                    10
                ),
                Err(Error::Expired)
            ));
            assert!(matches!(
                store.admit_page("auth", fence, &[], u64::MAX),
                Err(Error::Invalid)
            ));
            assert_eq!(store.fence("auth").unwrap(), fence);
        }
        #[test]
        fn authenticated_history_attempt_report_and_reopen_are_one_durable_result() {
            let mut f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let v = verified(&signer, &key, "pub", 1, 1000);
            let store = RuntimeStore::init(f.storage()).unwrap();
            let after = store
                .admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v,
                    }],
                    2,
                )
                .unwrap();
            let outcome = store
                .history_import("auth", after, &v, "history-one", 2)
                .unwrap();
            assert!(matches!(outcome, HistoryOutcome::Applied { item: Some(_) }));
            assert_eq!(scalar::<i64>(f.storage(),"SELECT COUNT(*) FROM shared_attempts WHERE sink='history' AND outcome='applied' AND report='pending'"),1);
            assert_eq!(scalar::<i64>(f.storage(),"SELECT COUNT(*) FROM clipboard_items WHERE copy_count=0 AND last_copied_at_unix_ms IS NULL"),1);
            let pending = store.report_pending("auth").unwrap();
            assert_eq!(pending.len(), 1);
            assert_eq!(pending[0].attempt_id, "history-one");
            assert_eq!(pending[0].publication_id, "pub");
            assert_eq!(pending[0].sink, "history");
            assert_eq!(pending[0].outcome, "applied");
            assert_eq!(pending[0].device, "device-A");
            assert_eq!(pending[0].environment, "test");
            assert_eq!(pending[0].channel, "channel-A");
            drop(store);
            f.reopen();
            let store = RuntimeStore::init(f.storage()).unwrap();
            assert_eq!(
                store
                    .history_import("auth", after, &v, "history-one", 2)
                    .unwrap(),
                outcome
            );
            assert_eq!(store.report_pending("auth").unwrap().len(), 1);
            assert!(matches!(
                store.ack_report("wrong-subscription", "history-one"),
                Err(Error::Missing)
            ));
            assert_eq!(store.report_pending("auth").unwrap().len(), 1);
            store.ack_report("auth", "history-one").unwrap();
            store.ack_report("auth", "history-one").unwrap();
            assert!(store.report_pending("auth").unwrap().is_empty());
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM clipboard_items"),
                1
            );
            assert!(matches!(
                store.history_import("auth", after, &v, "history-two", 2),
                Err(Error::Ineligible)
            ));
        }
        #[test]
        fn aggregate_page_budget_rolls_back_before_mutex_commit() {
            let f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, None);
            let text = "s".repeat(800_000);
            let a = verified_content(&signer, &key, "large-one", 1, 1000, &text);
            let b = verified_content(&signer, &key, "large-two", 2, 1000, &text);
            let store = RuntimeStore::init(f.storage()).unwrap();
            assert!(matches!(
                store.admit_page(
                    "auth",
                    fence,
                    &[
                        VerifiedArrival {
                            server_sequence: 1,
                            text: &a
                        },
                        VerifiedArrival {
                            server_sequence: 2,
                            text: &b
                        }
                    ],
                    2
                ),
                Err(Error::Limit)
            ));
            assert_eq!(store.fence("auth").unwrap(), fence);
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM shared_receipts"),
                0
            );
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM shared_replay"),
                0
            );
            store
                .admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &a,
                    }],
                    2,
                )
                .unwrap();
        }
        #[test]
        fn missing_folder_failure_has_report_and_does_not_reroute_or_retry() {
            let f = fresh();
            let (signer, key) = keys();
            let fence = setup_auth(f.storage(), &signer, Some(999));
            let v = verified(&signer, &key, "pub", 1, 1000);
            let store = RuntimeStore::init(f.storage()).unwrap();
            let after = store
                .admit_page(
                    "auth",
                    fence,
                    &[VerifiedArrival {
                        server_sequence: 1,
                        text: &v,
                    }],
                    2,
                )
                .unwrap();
            assert_eq!(
                store
                    .history_import("auth", after, &v, "history-one", 2)
                    .unwrap(),
                HistoryOutcome::MissingFolder
            );
            assert_eq!(scalar::<i64>(f.storage(),"SELECT COUNT(*) FROM shared_attempts WHERE outcome='failed' AND report='pending'"),1);
            assert_eq!(
                scalar::<i64>(f.storage(), "SELECT COUNT(*) FROM clipboard_items"),
                0
            );
            assert_eq!(
                store
                    .history_import("auth", after, &v, "history-one", 2)
                    .unwrap(),
                HistoryOutcome::MissingFolder
            );
            assert!(matches!(
                store.history_import("auth", after, &v, "history-two", 2),
                Err(Error::Ineligible)
            ));
        }
    }
}

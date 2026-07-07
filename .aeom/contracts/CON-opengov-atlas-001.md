---
artifact_id: "CON-opengov-atlas-001"
artifact_type: contract
project: "opengov-atlas"
version: 0.3.1
state: frozen
risk_tier: high
depends_on: ["AS-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
---

# Contract — SQLite Schema, Typed Edge Model & Data Access Layer API

> Realizes AS §7 CON-001/CON-002/CON-004. **Machine-validatable:** the DDL below executes cleanly in SQLite and the captured SPK-001 payloads insert against it (verified [E1] — see §5). The DAL interface is a TypeScript type-checked at build. Node-id scheme drives QA-08.

## 1. Store DDL (authoritative)

> **Storage optimization (owner-directed, [E1]-measured in SPK-003 §3e-f/DIS-001 D-7/D-8/DIS-002 D-10).** Every 32-byte address is **interned** to an auto-increment `account.id`; the true public key lives once in `account.pubkey` (BLOB, SS58 derived at display time). High-cardinality amounts are **8-byte REAL planck** (a whale's `balance × 6× conviction` overflows i64, so INTEGER is unsafe; REAL is the same 8 bytes, sorts numerically for the whale index, never overflows). Enums (`direction`/`status`/`proposal_kind`) and hashes/pubkeys are INTEGER/BLOB. Measured effect: vote 247→**88 B/row**, delegation 330→**58**. Two DBs result (DIS-002 D-10): the **build DB** keeps raw `preimage.bytes` (decode input) and measures **~42 MB full**; the **shipped DB drops `preimage.bytes`** (the DAL needs only decoded fields — raw bytes are 53% of the build DB) and measures **~19 MB full** — the number ADR-08 gates on. Baseline TEXT-address+no-strip would be ~91 MB. Per-referendum tallies stay TEXT (only 1,919 rows; exactness preserved, overflow-safe).

```sql
-- entities
-- account is the address dictionary: the ONE place a public key is stored; FKs elsewhere use id.
CREATE TABLE account(
  id INTEGER PRIMARY KEY AUTOINCREMENT, pubkey BLOB NOT NULL UNIQUE,  -- 32-byte pubkey; SS58 at display
  display TEXT, judgement INTEGER, parent_id INTEGER                  -- from People-chain identity backfill
);
CREATE TABLE referendum(
  idx INTEGER PRIMARY KEY, track INTEGER NOT NULL, status INTEGER NOT NULL,  -- status enum §2b
  ayes TEXT NOT NULL DEFAULT '0', nays TEXT NOT NULL DEFAULT '0', support TEXT NOT NULL DEFAULT '0', -- tallies TEXT (i128-safe)
  proposal_hash BLOB, proposal_kind INTEGER, proposer_id INTEGER, decision_deposit_who_id INTEGER,   -- kind enum §2b
  submitted_block INTEGER, decided_block INTEGER, confirmed_block INTEGER
);
CREATE TABLE track(
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, decision_period INTEGER, confirm_period INTEGER,
  min_approval TEXT, min_support TEXT, decision_deposit REAL
);
CREATE TABLE preimage(
  hash BLOB PRIMARY KEY, len INTEGER, decoded_pallet TEXT, decoded_method TEXT,
  decoded_args_json TEXT, beneficiary_id INTEGER, amount REAL, proposer_id INTEGER,
  bytes BLOB, available INTEGER          -- bytes = raw SCALE, BUILD-ONLY: 53% of the build DB, DROPPED
);                                       -- from the shipped DB (DIS-002 D-10); DAL reads decoded fields only
-- typed edges (rows; indexed on BOTH endpoints -> single-hop point lookups)
CREATE TABLE vote(
  id INTEGER PRIMARY KEY AUTOINCREMENT, voter_id INTEGER NOT NULL, poll INTEGER NOT NULL,
  direction INTEGER NOT NULL,               -- 0=Aye 1=Nay 2=Split 3=SplitAbstain (§2b)
  conviction INTEGER NOT NULL DEFAULT 0,    -- 0=0.1x .. 6=6x
  balance REAL NOT NULL DEFAULT 0,
  aye_balance REAL, nay_balance REAL, abstain_balance REAL,           -- Split/SplitAbstain
  effective_weight REAL NOT NULL DEFAULT 0,                           -- planck; = balance x conviction (0.1x when conv=0)
  is_delegated INTEGER NOT NULL DEFAULT 0, block INTEGER, active INTEGER NOT NULL DEFAULT 1
);
-- ONE canonical vote per (voter, poll) = latest AccountVote (DIS-002 D-11): a re-vote replaces the
-- earlier one; VoteRemoved sets active=0. Without this, one automated re-voter inflated poll 1042 to
-- 1,614 rows for 58 real voters. Backfill upserts on this key (ON CONFLICT ... DO UPDATE, latest block wins).
CREATE UNIQUE INDEX ux_vote_voter_poll ON vote(voter_id, poll);
CREATE TABLE delegation(
  id INTEGER PRIMARY KEY AUTOINCREMENT, delegator_id INTEGER NOT NULL, delegate_id INTEGER NOT NULL,
  track INTEGER NOT NULL, conviction INTEGER, balance REAL, block INTEGER, active INTEGER NOT NULL DEFAULT 1
);
-- both-endpoint indexes (the single-hop lookups)
CREATE INDEX ix_vote_poll   ON vote(poll);
CREATE INDEX ix_vote_voter  ON vote(voter_id);
CREATE INDEX ix_vote_whale  ON vote(poll, effective_weight DESC);  -- QA-04 top-9
CREATE INDEX ix_del_from    ON delegation(delegator_id);
CREATE INDEX ix_del_to      ON delegation(delegate_id);
CREATE INDEX ix_ref_track   ON referendum(track);
CREATE INDEX ix_ref_status  ON referendum(status);
CREATE INDEX ix_ref_prop    ON referendum(proposer_id);
CREATE INDEX ix_pre_benef   ON preimage(beneficiary_id);            -- treasury: who-is-paid-by reverse edge
CREATE INDEX ix_acct_display ON account(display);                  -- G1: identity search (CAP-011)
```
A **manifest** row set (table `meta(key PRIMARY KEY, value)`) records `schema_version`, `chain_block_range`, `built_at`, and per-table `row_count`; the SPA refuses a DB whose `schema_version` it doesn't support.

**2b. Enum codings (integer at rest, labelled by the DAL):** `direction` 0=Aye 1=Nay 2=Split 3=SplitAbstain · `status` 0=Submitted 1=Deciding 2=Confirmed 3=Approved 4=Rejected 5=TimedOut 6=Cancelled 7=Killed · `proposal_kind` 0=Lookup 1=Inline 2=Legacy · `conviction` 0=0.1× 1..6=1..6×.

## 2. Node-ID scheme (identity-stable — QA-08)

`referendum:<idx>` · `track:<id>` · `account:<addr>` (canonical SS58, path-independent) · `preimage:<hash>` · `vote:<addr>:<poll>` · `delegation:<addr>:<track>`. An account is the **same** node however reached; a neighbour whose id already appears earlier in the journey is flagged `alreadyVisited`.

> **Node ids stay address-canonical — the interned integer `account.id` is internal storage only and is NEVER exposed in a node id or URL.** Integer ids are assigned in backfill order and are **not stable across rebuilds**; the SS58 address is the rebuild-stable canonical identity that QA-08 (identity stability) and CAP-010 (deep-link) require. The DAL resolves `id ↔ pubkey ↔ SS58` at its boundary.

**Breadcrumb loop auto-collapse (CON-004/CAP-007/QA-08, [E1] SPK-003 §3g):** when a traversal re-enters a node already in the breadcrumb, the journey **collapses back to that node's earlier position** (the breadcrumb is truncated to `indexOf(node)+1`) rather than growing unbounded — proven on the real graph, which is recursive and self-referential (e.g. Referendum→Proposer→their Referenda can return to the origin).

## 3. Data Access Layer API (TypeScript, authoritative)

```ts
export type NodeId = string;                       // per §2 scheme
export interface GraphNode { id: NodeId; kind: 'referendum'|'track'|'account'|'preimage'|'vote'|'delegation';
  label: string; data: Record<string, unknown>; alreadyVisited?: boolean; }
export interface GraphEdge { source: NodeId; target: NodeId; relation:
  'runs_on'|'enacts'|'submitted_by'|'received_vote'|'cast_by'|'delegates_to'|'pays'; }
export interface Neighbourhood { center: GraphNode; nodes: GraphNode[]; edges: GraphEdge[];
  cluster?: ClusterAggregate; }               // cluster present when votes summarized
export interface ClusterAggregate { pollIndex: number; remainderCount: number;
  totalEffectiveWeight: string; ayes: number; nays: number; abstains: number; }

export interface DataAccess {
  neighbours(id: NodeId): Promise<Neighbourhood>;         // SINGLE-HOP only
  clusterMembers(pollIndex: number, opts: { offset: number; limit: number; search?: string })
    : Promise<{ total: number; rows: GraphNode[] }>;      // paginated sidebar (CAP-005)
  entityDetail(id: NodeId): Promise<GraphNode>;           // side panel (CAP-002/009)
  searchReferendaAndAccounts(q: string, limit: number): Promise<GraphNode[]>; // CAP-011
  referendaPage(opts: { offset: number; limit: number; track?: number; status?: string;
    sort?: 'recent'|'turnout'|'approval' }): Promise<{ total: number; rows: GraphNode[] }>; // CAP-001
  manifest(): Promise<{ schemaVersion: number; blockRange: [number, number]; builtAt: string }>;
}
```
The DAL is the **only** query-time module that opens the DB; the ship-whole-to-OPFS-vs-range-request-vs-server choice lives entirely behind this interface (ADR-01/03/08). `neighbours()` MUST issue only indexed single-hop lookups (no recursive/transitive SQL). The DAL also owns **id↔address resolution**: it joins the internal integer `voter_id`/`proposer_id`/etc. FKs to `account.pubkey` and emits **SS58 addresses** in all `NodeId`s and labels — internal integer ids never cross this boundary. Integer enums (`direction`/`status`/`proposal_kind`) are labelled here too.

## 4. Whale/cluster contract (QA-04)

`neighbours('referendum:X')` returns the top-N votes by `effective_weight` (via `ix_vote_whale`) as individual `vote` nodes plus one `ClusterAggregate` for the remainder where `remainderCount = totalVotes − N` and `ayes/nays/abstains/totalEffectiveWeight` equal the SQL aggregate of the remainder. Votes here are the **deduped canonical set** (one latest AccountVote per voter — `ux_vote_voter_poll`, DIS-002 D-11), so `totalVotes` = distinct voters, not vote-calls. **Default N = 9 individual + 1 aggregate node** (configurable, PO A-09). "Influence" = `effective_weight = balance × conviction` — a voter's conviction-weighted power over the outcome; [E1] SPK-003 §3h measured on the busiest real referendum by distinct voters (**ref 453, 751 voters**) that the top-9 hold **36.5%** of total effective weight and the remaining **742 voters collapse to one "+742" aggregate** (678 aye / 57 nay) — top-9+aggregate loses no decision-relevant signal while avoiding a 751-node hairball. Clicking any node (whale, aggregate-expanded member, or any entity) calls `entityDetail` to fill the sidebar (CAP-002/009).

## 5. Machine-validation (executed [E1])

The original schema was executed in `node:sqlite` with the real captured SPK-001 payloads (`CON-001_validation.json`). The **optimized schema of §1** is validated at full scale by SPK-003: the real relay backfill builds an `atlas.db` under this exact DDL (interned ids, REAL planck, integer enums, BLOB keys) and `SPK-003_measurements.json`/`graph_closure_analysis.json` report real row counts, the **measured** VACUUMed size (**build 35.7 MB / shipped 15.3 MB @85% → ~42 / ~19 MB full**, DIS-002 D-10), `PRAGMA integrity_check = ok`, interning integrity (8,089 ids = 8,089 distinct pubkeys, 0 collisions), and single-hop query round-trips (0.15–1.7 ms) on the full dataset; the three vote variants insert with correct `effective_weight` (`CON-002_vote_variant_validation.json`). Ongoing CI check: a build step runs the DDL, loads a real payload fixture, asserts `integrity_check = ok` + a single-hop round-trip + no node id exposes an internal integer account id + **no duplicate active vote per (voter, poll)** (`ux_vote_voter_poll`) + **the shipped DB has no `preimage.bytes`**. The DAL interface is enforced by `tsc`.

## 6. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | architecture | approve | Schema is machine-validatable (DDL executed, integrity_check ok, §5); both-endpoint indexes make every `neighbours()` an indexed point lookup (ADR-02). DAL interface is the sole serving-model boundary. G1 identity-search index incorporated. |
| 2026-07-07 | quality | approve | DDL + TS interface + node-id scheme are precise enough for contract/unit tests; §5 already demonstrates round-trip on real payloads. No blocking issues. |
| 2026-07-07 | performance | approve | [E1] single-hop latency (SPK-002) + `ix_vote_whale` composite index keep whale top-N a bounded indexed read. |
| 2026-07-07 | security | approve | Read-only store; no secrets in schema; identity/preimage text sanitization enforced downstream (QA-14). |
| 2026-07-07 | architecture + quality (v0.2.x change, evidence DIS-001/SPK-003) | approve | Optimized interned/REAL/BLOB schema adopted on [E1] measured bytes/row (vote 247→88; delegation 330→58; full-history DB ~91→~32 MB). Node ids stay **address-canonical** — the integer `account.id` is internal-only and rebuild-unstable, so exposing it would break QA-08/CAP-010; the DAL resolves id↔SS58 at its boundary. Amounts are REAL planck because whale `balance×6×` overflows i64 (DIS-001 D-7). Whale default top-9. Schema executes + holds real data at full scale (graph_closure_analysis.json). No blocking issue. |
| 2026-07-08 | architecture + quality (v0.3.0 change, evidence DIS-002/SPK-003) | approve | Real **measured** build proved two things the projection missed: (1) raw `preimage.bytes` is 53% of the build DB and build-only → **dropped from the shipped DB**, which measures **~19 MB** (not ~32 MB) — ADR-08 ship-whole holds with 4× headroom; (2) a re-voter cast 1,550 votes on one poll → **`ux_vote_voter_poll` UNIQUE(voter_id, poll)** enforces one latest AccountVote, fixing whale/render truth (QA-04). Whale exemplar refreshed to ref 453 (751 voters, top-9 36.5% + "+742"). Interning integrity re-confirmed (0 collisions). CI check extended for both new invariants. |

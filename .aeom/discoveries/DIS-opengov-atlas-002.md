---
artifact_id: "DIS-opengov-atlas-002"
artifact_type: discovery
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: high
depends_on: ["DIS-opengov-atlas-001", "CON-opengov-atlas-001", "CON-opengov-atlas-002", "AS-opengov-atlas-001", "SPEC-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
discovered_during: "spike:SPK-opengov-atlas-003 (real full-scale backfill measurement)"
implementation_paused: false
---

# Discovery — Real measured DB size (supersedes projection), vote de-duplication requirement, and measured graph completeness

> Logged during SPK-003 after building a **real optimized `atlas.db`** from the downloaded relay data (idx 0–1580, 85.4% of full-history votes) and measuring it, rather than projecting from bytes/row. Two facts here **correct** earlier projections in [[DIS-opengov-atlas-001]] (D-5/D-8 were estimates); two are new correctness/measurement findings. All §2 facts are [E1] (measured on the real DB / `SPK-003_measurements.json`, `graph_closure_analysis.json`). Decisions do not flip — ship-whole still holds with a larger margin — but the numbers and two contract rules change.

## 1. What Was Being Attempted

Turning SPK-003's DB-size **projection** into a **measurement** by building the real DB from downloaded data, and empirically proving the recursive-graph closure, breadcrumb loop-collapse, and top-9-influence render model on real rows (owner directives: reuse downloaded data as a hydration seed; verify the whole recursive graph is present; render 9 influential + 1 aggregate).

## 2. What Was Discovered (observed facts only, evidence-tagged)

- **D-10 — Raw `preimage.bytes` is ~53% of the build DB and is build-time-only; the *shipped* DB is far smaller than projected.** [E1] In the real VACUUMed build DB, `preimage.bytes` (raw SCALE call bytes) totals **19.8 MB of 35.7 MB** (one `utility.batch` preimage alone is 1.57 MB). The browser DAL never needs raw bytes — only the decoded `pallet/method/args/beneficiary/amount`. **Stripping `bytes` from the shipped artifact** yields **15.3 MB at 85% → ~18.6 MB full-history** (deduped). Measured build DB **35.7 MB → ~42 MB full**. This **supersedes DIS-001 D-8's projected "~32 MB"** (which conflated build vs shipped and under-counted the raw-bytes BLOBs). **Consequence:** the shipped `atlas.db` is **~19 MB** — ship-whole (ADR-08, N=75 MB) holds with a large margin; `preimage.bytes` is a **build-only column, dropped from the published DB**.
- **D-11 — A voter can cast many `vote` calls on one poll; only the latest AccountVote is canonical (de-dup required).** [E1] The chain keeps only a voter's most-recent `AccountVote` per referendum, but the backfill inserted every `vote` call as a new active row → **18,763 superseded rows (9.7%)** across 11,292 (voter,poll) pairs. Extreme real case: **poll 1042 shows 1,614 votes but only 58 distinct voters — one account (voter 1273) cast 1,550** across 2 weeks (an automated re-voter). Interning is clean (8,089 ids = 8,089 distinct pubkeys, 0 collisions), so this is real on-chain behaviour, not a decode bug. **Consequence:** votes MUST be de-duplicated to **one active row per (voter_id, poll) = latest by block**; whale/top-9 and node rendering operate on the deduped set (else one bot renders as 1,550 nodes). The census figure **227,246 is vote *calls*; distinct latest votes ≈ 205 K** (the rendered node count).
- **D-12 — Top-9-by-influence + one aggregate node is the correct, sufficient render model (directive D), proven on the busiest real referendum.** [E1] The busiest referendum by **distinct** voters is **ref 453 with 751 voters** (not poll 1042, whose 1,614 is a single bot). Its **top-9 by `effective_weight` hold 36.5%** of total weight; the remaining **742 voters (678 aye / 57 nay, 206,773 DOT)** collapse to one aggregate **"+742"** node. Confirms CAP-005/006 and ADR-06: render 9 influential nodes + 1 aggregate; clicking any resolves full detail from the local store.
- **D-13 — The full recursive graph is complete and closes on real data; preimage availability 99.5%.** [E1] Measured on the real DB: **every referendum has a proposer (1,581/1,581 = 100%)**; **1,465/1,473 Lookup referenda have their preimage available (99.5%)** (8 legacy/cleared gaps → `available=0` degradation); 7,153 distinct voters, 1,083 delegators, 363 delegates over 8,089 accounts. A real recursive walk Referendum→Proposer→their Referenda→Votes→Voter→Delegations closed with **no dead-ends**, hitting a self-referential loop (**referendum:79 ↔ account:836**, a proposer of 96 referenda) that triggers **breadcrumb collapse to length 0**. Answers directive C: the entire OpenGov graph Atlas renders is present and traversable.

## 3. Impacted Knowledge

| Artifact ID | Section | Nature of impact | Blocking? |
|---|---|---|---|
| CON-opengov-atlas-001 | §1 DDL (vote), §1 preimage note | Add **UNIQUE(voter_id, poll)** on the active vote (latest-wins upsert) [D-11]; mark `preimage.bytes` **build-only, absent from the shipped DB** [D-10] | Yes (correctness) |
| CON-opengov-atlas-002 | §1 vote row; §2 idempotency; new build step | Vote mapping upserts to latest per (voter,poll) [D-11]; add **strip `bytes` before publishing** build step [D-10] | Yes (correctness) |
| AS-opengov-atlas-001 | ADR-08/09 numbers; QA-03/04 | Correct measured sizes (shipped ~19 MB / build ~42 MB); `bytes`-strip as the biggest size lever; whale example ref 453 | No (decision unchanged) |
| SPEC-opengov-atlas-001 | QA-02/03/04 | QA-03 measured ~19 MB shipped; QA-04 dedup-to-latest + ref-453 truth; QA-02 upsert-no-dup covers revotes | No |
| DIS-opengov-atlas-001 | D-5/D-8 | Projected ~32 MB **superseded** by measured ~19 MB shipped / ~42 MB build (this discovery) | — |

## 4. Proposed Knowledge Update

Update CON-001: add `UNIQUE(voter_id, poll)` to the active `vote` (latest-by-block wins) and annotate `preimage.bytes` as a **build-only column stripped from the shipped DB**. Update CON-002: the vote mapping **upserts to the latest AccountVote per (voter,poll)** (a later `vote` call replaces the earlier; `VoteRemoved` deactivates), and add a **publish step that drops `preimage.bytes`** from the shipped artifact after decode. Update AS: correct ADR-08/09 to the **measured** shipped ~19 MB / build ~42 MB with `bytes`-strip as the dominant lever, and set the whale exemplar to ref 453 (751 voters, top-9 36.5% + "+742"). Update SPEC: QA-03 = shipped DB ≤ 75 MB (measured ~19 MB); QA-04 binds the ref-453 ground truth and asserts dedup-to-latest; QA-02 asserts revote upsert produces no duplicate active vote. Leave FM frozen (no decision flip).

## 5. Governance Triage (Harness/authority completes)

| Field | Value |
|---|---|
| Risk tier assigned | high (touches high-tier contracts CON-001/002 correctness) |
| Action | update CON-001, CON-002, AS, SPEC via change-request; record supersession of DIS-001 D-5/D-8 |
| change_requested raised on | CON-opengov-atlas-001, CON-opengov-atlas-002, AS-opengov-atlas-001, SPEC-opengov-atlas-001 |
| Implementation resume condition | N/A — planning phase; no implementation in progress |

## 6. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-08 | architecture | approve | Build-vs-shipped split (D-10) is the right factoring — raw bytes are a decode input, not a query need; dropping them from the published DB is sound and keeps ship-whole. Dedup-to-latest (D-11) matches chain semantics (one AccountVote per poll). |
| 2026-07-08 | quality | approve | Every fact is measured on the real DB with the script preserved (`SPK-003_measurements.json`); the projection→measurement supersession of DIS-001 is stated honestly rather than silently overwritten; the poll-1042 outlier is diagnosed (bot, not decode bug) before being acted on. |

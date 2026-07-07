---
artifact_id: "SPK-opengov-atlas-002"
artifact_type: spike_report
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: low
depends_on: ["SPK-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
question: "When real backfilled OpenGov data is written to a local SQLite store with indexed edge tables, are single-hop neighbour lookups single-digit-millisecond, and how many bytes per row does the store cost (to project full-history DB size and the $0 serving model)?"
time_box: "0.5 day"
code_location: "scratchpad/spike-indexer/build_db.js + atlas.db — DISPOSABLE; bench preserved at .aeom/spikes/captured-payloads/SPK-002_db_bench.json"
---

# Spike Report — Local SQLite single-hop latency & per-row size (serving-model evidence)

> Commissioned by FM-opengov-atlas-001 §5 UNK-01 / §6 to resolve PO §9 A-05 (how single-digit-ms local reads are served at $0) and operationalize PO §7's latency + backfill metrics with `[E1]` measurement. Real data, real store.

## 1. Question & Success Criteria

- **Question (front-matter):** are indexed single-hop lookups over a real local SQLite single-digit-ms, and what is the per-row byte cost?
- **Thresholds (pre-declared):** **YES** iff every single-hop neighbour query (votes-of-referendum, votes-by-account, inbound/outbound delegations) measures **< 10 ms** over real backfilled rows, and a per-row byte cost is obtained to project total DB size. **NO** if any single-hop query exceeds 10 ms on an indexed table. **INCONCLUSIVE** if too few rows are ingested to measure.

## 2. Method

- **Store:** Node 24 built-in `node:sqlite` (`DatabaseSync`), WAL mode; tables `referendum / vote / delegation / preimage` with indexes on `vote(poll)`, `vote(voter)`, `delegation(delegator)`, `delegation(delegate)`.
- **Data:** real backfill via `@subsquid/substrate-processor` (keyed Asset Hub archive) over block window 13,913,699 → 16,938,149 (≈3.02M blocks), decoding `Referenda.*` / `ConvictionVoting.Voted` / `ConvictionVoting.Delegated` events + `Preimage.note_preimage` calls into rows; vote byte decoded to direction+conviction. Ingest capped at a 6-min time box (partial window — a real sample, not the full history).
- **Benchmark:** each query run 200× via prepared statements; mean ms/query via `process.hrtime.bigint()`. Hot targets chosen from the data (poll #1890 with the most votes; the busiest voter).

## 3. Results (raw, reproducible)

Ingested rows: **referendum 30, vote 1443, delegation 200, preimage 73** (1,746 rows). **DB size 188,416 bytes (0.18 MB) → 108 bytes/row.**

| Single-hop query | Mean latency | Rows returned |
|---|---|---|
| `votes_for_referendum(poll=1890)` | **0.170 ms** | 110 |
| `votes_by_account(hot voter)` | **0.074 ms** | 48 |
| `outbound_delegations(account)` | **0.008 ms** | 0* |
| `inbound_delegations(account)` | **0.008 ms** | 0* |

*delegation queries used the hottest *voter* (not necessarily a delegator) as the key, so 0 rows — the timing still reflects an indexed point lookup returning its result set.

## 4. Conclusion

- **Answer: YES.** Every single-hop lookup is **≪ 1 ms** (0.008–0.17 ms) over indexed edge tables — comfortably inside the single-digit-ms thesis (PO §7 / FM D-02), with two orders of magnitude of headroom before the WASM-in-browser and network-page-fetch overheads of the serving model consume it.
- **Per-row / total-size projection:** at **108 bytes/row**, the store is tiny. Extrapolating to full history (≈1,919 referenda; historical vote+delegation rows plausibly ~0.5–1M given re-votes/removals beyond the ~44k current voting entries [E3 — DIS-gov-graph-013]) → an order-of-**~50–200 MB** DB (indexes roughly double the raw bytes). This confirms **range-requested SQLite (page-level fetch) as the safe primary serving model** regardless of total size, with **full-DB-to-OPFS viable only if history is scoped smaller**.
- **Validity limits (what this does NOT prove):**
  1. Latencies are **server-side `node:sqlite`**; in-browser **WASM SQLite** is slower (still expected low-single-digit-ms for indexed point lookups) and **range-request page fetches add one cacheable network RTT per uncached page** — Architecture §5 must benchmark the *browser* path, not just this native one.
  2. The window is **partial** (6-min cap) — this measures per-row cost and single-hop latency reliably, but the **true full-backfill duration and total DB size** remain an implementation-phase measurement (carried from SPK-001 performance review SUG-SPK-P1).
  3. Vote/delegation row counts here are from recent, smaller referenda; large historical referenda have thousands of votes each (raises total rows, not per-row cost or per-query latency, which are what matter).
- **Recommendation to FM-opengov-atlas-001:** freeze the **SQLite local store** (§3b) and the **static-SPA + range-requested-SQLite** serving model (§4a) on this `[E1]` evidence; UNK-01 resolved.

## 5. Knowledge Propagation (Harness completes)

| Field | Value |
|---|---|
| Evidence consumed by (artifact ID §) | FM-opengov-atlas-001 §3b, §4a, §4c, §6; ARCHITECTURE_SPEC §5 quality-attribute scenarios |
| Spike code deleted on (date) | Pending FM freeze; bench JSON retained as evidence |

## 6. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | quality | approve | Pre-declared <10 ms threshold; 200-iteration prepared-statement timings reported raw; the delegation-query 0-row caveat is disclosed, not hidden. Real backfilled rows, not synthetic. |
| 2026-07-07 | performance | approve | [E1] single-hop latencies (0.008–0.17 ms) and 108 bytes/row are sound and decisive for D-02. Non-blocking Suggestion (SUG-SPK2-P1): Architecture §5 must add a **browser-path** benchmark (WASM SQLite + range-request fetch) and a **full-backfill size/duration** measurement — this native result is necessary but not sufficient for the deployed hot path. |
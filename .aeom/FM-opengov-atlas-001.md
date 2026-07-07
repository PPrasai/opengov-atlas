---
artifact_id: "FM-opengov-atlas-001"
artifact_type: feasibility_matrix
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: high
depends_on: ["PO-opengov-atlas-001", "SPK-opengov-atlas-001", "SPK-opengov-atlas-002"]
supersedes: null
owners: ["Parikshit"]
evaluation_mode: technical_only
---

# Feasibility Matrix — OpenGov Atlas

> **MASTER MOLD — INSTRUCTIONS TO THE REASONING ENGINE**
> `technical_only` route (detailed overview). Product questions are out of bounds; scope is language / framework / infrastructure. This org has **no default stack** — the stack is derived from PO §6 constraints. Note two settled boundaries carried from the Product Overview, which are *constraints*, not open axes: (a) data is sourced by **indexing a decentralized archive into a local store, not REST** [E2 — owner directive; PO §6]; (b) the indexer axis is decided on **executed [E1] evidence** (SPK-opengov-atlas-001, frozen), not vendor claims.

## 1. Decision Drivers (traced from Product Overview §6)

| Driver ID | Constraint (verbatim from PO §6) | Weight (1–5) | Rationale for weight |
|---|---|---|---|
| D-01 | Integration: source governance data by **indexing a decentralized Substrate archive into a local store, NOT SubSquare/Subscan/Polkassembly REST** | 5 | Hard owner boundary; any REST-at-query-time candidate is disqualified, not penalized [E2 — PO §6, owner 2026-07-07] |
| D-02 | Latency: every traversal is a **single-hop, single-digit-ms local read**; the graph must feel instant | 5 | The product's core thesis (PO §3/§7); the storage+serving model lives or dies on this |
| D-03 | Budget: deploy to a **free host at ~$0** operating cost | 5 | Hard ceiling (PO §6); disqualifies any always-on server/DB the owner must pay for |
| D-04 | Team skills: solo, deep **React/TypeScript/frontend**, limited Polkadot/Substrate depth | 5 | A stack the solo owner cannot execute does not ship; also argues for reusing gov-graph's proven frontend stack [E3] |
| D-05 | Data: hold the **full OpenGov history** (referenda, every vote, delegation, preimage, identity), stored atomically | 4 | Drives store choice and the backfill/decoding strategy; volume is real but bounded (≈1919 referenda; tens of thousands of voting entries) [E3 — DIS-gov-graph-013] |
| D-06 | Governance state is on **Asset Hub** (since 2025-11-04); identity on the **People chain** | 4 | The indexer must target the correct chains; proven in SPK-001 [E1] |
| D-07 | Timeline: no hard deadline; "rapid iteration and momentum" | 3 | Favors lower-ceremony, faster-to-ship options and stack reuse from gov-graph [E3] |

## 2. Language Evaluation

### Candidates

| Candidate | Why it is a credible candidate (evidence) |
|---|---|
| TypeScript | Team's stated expertise (D-04) [E2]; the chosen indexer (`@subsquid/substrate-processor`) is TypeScript-native and was run in TS/JS in SPK-001 [E1]; `@polkadot/api` (preimage/SCALE decode) is TS-first; gov-graph shipped this domain in TS [E3 — FM-gov-graph-001 §2] |
| Rust | Substrate's native language; some indexers (e.g. Subsquid's ingester internals, `subxt`) are Rust; maximal decode fidelity [E4] |
| Python | `py-substrate-interface` exists; common for data/ETL scripting [E4] |

### Scoring (1–5 per driver; every cell tagged)

| Driver | Weight | TypeScript | Rust | Python |
|---|---|---|---|---|
| D-04 Team skills | 5 | 5 [E2 — direct match] | 1 [E4 — no stated Rust; steep solo curve] | 2 [E4 — no stated Python; not the frontend language] |
| D-01/D-06 Indexer fit | 5 | 5 [E1 — Subsquid TS processor proven in SPK-001] | 3 [E4 — Rust indexers exist but heavier for this team] | 2 [E4 — weaker Substrate indexing ecosystem] |
| D-02 Latency (one codebase, FE+decode) | 5 | 5 [E4 — same language front-to-back incl. in-browser SQLite/decoders] | 2 [E4 — Rust→WASM possible but adds a toolchain] | 1 [E4 — not a browser language] |
| D-07 Timeline | 3 | 5 [E4 — reuses gov-graph tooling E3] | 2 | 2 |

### Trade-off narrative

**TypeScript — for:** it is the only candidate that spans the whole system — the Subsquid indexer (proven [E1]), preimage/SCALE decoding via `@polkadot/api`, the React frontend, and in-browser SQLite querying — in one language the solo owner already knows deeply (D-04). *Against:* TS is not Substrate's native language, so the deepest runtime-decode edge cases lean on JS libraries rather than `subxt` — mitigated because SPK-001 showed the archive already serves decoded JSON, so we rarely hand-decode. *What would change this:* if the project needed bespoke low-level runtime decoding across many historical spec versions that JS libraries couldn't handle — not indicated by SPK-001. **Rust** loses on D-04 outright (no stated experience, solo). **Python** is neither the frontend language nor a strong Substrate-indexing choice. **Recommendation: TypeScript.**

## 3. Framework Evaluation

*Conditional on TypeScript (§2). Five sub-axes; collapsing them would hide real decisions.*

### 3a. Indexer / ETL (the decisive, [E1]-decided axis)

**Candidates:** `@subsquid/substrate-processor` [E1 — proven end-to-end in SPK-001] · SubQuery (`@subql/node`) [E4] · direct `@polkadot/api` RPC scraping into the store [E1 partial — gov-graph used on-chain @polkadot/api reads E3].

| Driver | Weight | Subsquid processor | SubQuery | Direct @polkadot/api scrape |
|---|---|---|---|---|
| D-01 Archive-not-REST | 5 | 5 [E1 — downloads from SQD decentralized archive; SPK-001] | 4 [E4 — indexer over RPC/dictionary, also not REST] | 3 [E4 — RPC-only, no archive acceleration] |
| D-02/D-05 Backfill speed & completeness | 5 | 5 [E1 — 599 gov blocks/52.6s via empty-block-skipping archive; full backfill minutes-to-hours] | 3 [E4 — capable but unproven here; dictionary coverage for Asset Hub/People unverified] | 1 [E1 — RPC-only ≈8 blocks/s in SPK-001 Run C; ~10⁶× too slow for 17.9M blocks] |
| D-06 Right chains decoded | 5 | 5 [E1 — asset-hub-polkadot + people-chain gateways proven; polkadot relay archive present] | 3 [E4 — unverified for these exact chains] | 4 [E3 — @polkadot/api reads Asset Hub state, but events/history need per-block scans] |
| D-04 Team fit | 5 | 4 [E1 — TS processor, ran with a small disposable driver; some framework learning] | 3 [E4 — GraphQL/manifest model, more new concepts] | 4 [E3 — gov-graph already used @polkadot/api] |
| D-07 Time-to-first-data | 3 | 5 [E1 — real payloads captured same day] | 2 [E4 — unproven setup] | 2 [E4 — slow scans] |

**Trade-off narrative:** **Subsquid — for:** it is the *only* candidate proven end-to-end against the real chains in SPK-001 — it downloaded every entity Atlas needs, decoded, from the Asset Hub + People archives, and its empty-block-skipping makes full backfill tractable (the single strongest evidence-based match in this matrix, [E1]). *Against:* the v2 archive now **requires an API key** and enforces `50 req/10s/IP` (owner-supplied key resolves this), and running the processor headless needed a small custom `Database` driver — minor. *What would change this:* if the SQD archive dropped Asset Hub/People coverage or the key economics changed materially → SubQuery is the designated fallback. **SubQuery** is a credible alternative indexer but is entirely unproven for these specific chains here — adopting it now would violate the executed-evidence gate. **Direct @polkadot/api scraping** is disqualified for *backfill* by SPK-001 Run C (RPC-only is ~10⁶× too slow and cannot find sparse events efficiently); it remains the right tool for *current-state* reads (tallies, current delegation state) and the future **live-sync tail** (deferred). **Recommendation: `@subsquid/substrate-processor` for backfill; `@polkadot/api` retained for current-state/live-tail reads.**

### 3b. Local Store / Database

**Candidates:** SQLite (embedded; `node:sqlite` for backfill, WASM build in-browser) · DuckDB (embedded analytical) · PostgreSQL (server).

| Driver | Weight | SQLite | DuckDB | PostgreSQL |
|---|---|---|---|---|
| D-03 $0 / no server | 5 | 5 [E4 — single embedded file, zero server; ships as a static asset] | 4 [E4 — embedded, but larger WASM & less browser-mature] | 1 [E4 — needs a hosted server, breaks $0] |
| D-02 Single-hop indexed reads | 5 | 5 [E1 — SPK-002 measured single-digit-ms single-hop queries, see §4c] | 3 [E4 — columnar; tuned for scans/aggregates, not point single-hop lookups] | 4 [E4 — fast, but a network hop + hosting] |
| D-04 Team fit / ubiquity | 4 | 5 [E4 — ubiquitous, trivial SQL; Node 24 has built-in `node:sqlite`] | 3 [E4 — newer, analytical mindset] | 4 [E4 — familiar but ops burden] |
| D-05 Full-history capacity | 4 | 4 [E1 — SPK-002 DB size measured, see §4c; comfortably holds the dataset] | 4 [E4 — handles large data] | 5 [E4 — unbounded] |

**Trade-off narrative:** **SQLite — for:** it is the one store that is simultaneously $0/serverless (D-03), fast at the *point/single-hop* access pattern Atlas actually uses (D-02, measured in SPK-002), and shippable as a single static file the browser can read — the exact shape PO §8's "graph is a rendering concept, not a storage concept" argues for. *Against:* it is not built for heavy analytical aggregation — irrelevant, since Atlas never runs deep multi-hop or whole-graph analytics (PO §5 non-goals). **DuckDB** is excellent for scans/aggregates but is optimized for the opposite of Atlas's point-lookup pattern, and its browser story is less mature. **PostgreSQL** is the most capable but requires a hosted server, breaking D-03 outright. **Recommendation: SQLite**, with edge/join tables indexed on both endpoints so "neighbours of node X" is an indexed point lookup in either direction (PO §8).

### 3c. Graph Rendering Library

**Candidates:** React Flow [E3 — chosen & shipped in gov-graph for the identical node-centered interaction] · Cytoscape.js [E4] · D3-force [E4].

**Trade-off:** This is the same decision gov-graph already made on evidence [E3 — FM-gov-graph-001 §3b]: React Flow's declarative React component model fits a React-only team (D-04), and its node/edge/drag primitives map directly onto focused-traversal + re-center. Atlas's "one center + immediate neighbours, never the whole graph" (PO §6.3) renders *tens* of nodes at a time — trivial for React Flow, and it sidesteps the large-graph-layout scenarios where Cytoscape would win. D3-force fights React's rendering model. *Flip condition:* if a view ever needs thousands of simultaneous physics-laid-out nodes (contradicted by PO §5's "never materialize the whole graph") → Cytoscape. **Recommendation: React Flow.**

### 3d. UI Framework / State / Styling

**Candidates & recommendation (reused from gov-graph on evidence [E3 — FM-gov-graph-001 §3a/§3c/§3d], same team & constraints):** **React** (D-04 team skills) · **Zustand** (selective-subscription state, avoids re-render jank against D-02; React Flow's own recommended external store) · **Tailwind CSS** (fast solo iteration, zero-runtime styling). Rejected alternatives and rationale are already frozen institutional knowledge in FM-gov-graph-001; conditions here are identical, so they are adopted rather than re-derived. *Flip conditions* per that record still apply.

### 3e. Preimage / SCALE decoding

**Candidates:** `@polkadot/api` type registry decode [E3 — available in gov-graph] · `@subsquid/substrate-runtime` decode · raw hand-decode. **Recommendation: `@polkadot/api`** to decode preimage `bytes` → pallet·method·args (CAP-009), consistent with the TS choice; SPK-001 confirmed raw preimage bytes are available to decode.

## 4. Infrastructure Evaluation

### 4a. Serving Model / Compute (resolves PO §9 A-05 — the consequential axis)

The question: **how are single-digit-ms local reads served under a $0 free host?** Candidates:

| Candidate | How it serves reads | $0 fit (D-03) | Latency fit (D-02) |
|---|---|---|---|
| **Static SPA + range-requested SQLite** (`sql.js-httpvfs`/WASM SQLite over HTTP range requests) | Prebuilt SQLite hosted as a static asset; browser fetches only the DB *pages* a query touches | 5 [E4 — pure static hosting, no server] | 4 [E1 — indexed single-hop touches few pages; SPK-002 local read is single-digit-ms; network page-fetch adds one round-trip, cacheable] |
| **SPA + full-DB in OPFS** (download the whole SQLite once, query in-browser via wa-sqlite) | Ship the entire DB to the browser, persist in OPFS, query locally | 5 [E4 — static hosting] | 5 [E1 — fully local after first load; SPK-002 latency applies directly] — **iff DB fits a one-time download** |
| **Meta-framework (Next.js) server-side SQLite reads** on a free serverless tier | Server route reads the bundled SQLite; browser calls the route | 3 [E4 — free serverless tier exists but cold starts; bundle-size limits] | 3 [E4 — server hop + cold start vs local read] |

**Recommendation:** **Static SPA + range-requested SQLite as the primary**, with **full-DB-to-OPFS as the variant** when the measured DB size is small enough for a one-time download (decided by SPK-002's size number, §4c), and **Next.js server-side reads as the fallback** if client-side WASM SQLite proves inadequate. This keeps the hot path free of any third-party API (PO §3) and at $0 (D-03) while meeting the single-hop latency thesis (D-02). All three are built behind **one data-access abstraction** so the choice changes one module, not call sites — the same isolation gov-graph's review mandated [E3 — AS-gov-graph-001 ADR-01].

### 4b. Backfill Execution (indexer runtime)

The Subsquid backfill is an **offline batch job**, not a hosted service: it runs locally (or in CI) against the keyed SQD archive + RPC, produces the SQLite artifact, and that artifact is published as a static asset. No always-on indexer server is hosted → preserves D-03. Checkpoint/resume (PO CAP-008) is the processor's native progress tracking plus the last-synced block persisted alongside the DB. *Rejected:* running a continuously-hosted indexer service — unnecessary for an MVP whose freshness need is a periodic rebuild (PO §5 non-goal: live sync deferred), and it would incur hosting cost.

### 4c. Hosting & Measured Store Performance

**Hosting candidates (static):** Vercel / Netlify / Cloudflare Pages / GitHub Pages free tiers — all serve static assets (SPA + SQLite file, with HTTP range-request support) at $0. Cloudflare Pages/Netlify are noted for generous static bandwidth; the choice is not load-bearing and is deferred to Architecture. **Measured store performance [E1 — SPK-opengov-atlas-002, `node:sqlite`, real backfilled data]:** indexed single-hop reads **0.008–0.17 ms** (votes-for-referendum 0.17 ms @110 rows; votes-by-account 0.074 ms; delegation lookups 0.008 ms) — two orders of magnitude inside the single-digit-ms thesis (D-02); store cost **108 bytes/row**, projecting a **~50–200 MB** full-history DB. This confirms range-requested SQLite as the safe primary (page-level fetch is size-independent); full-DB-to-OPFS is viable only if history is scoped smaller. Browser-path (WASM + range-fetch RTT) and true full-backfill size/duration are carried to ARCHITECTURE_SPEC §5 as executable benchmarks (SPK-002 validity limits; SUG-SPK2-P1).

## 5. Cross-Cutting Risks & Unknowns

| ID | Unknown | Affected axis | Cheapest resolution | Est. cost of being wrong |
|---|---|---|---|---|
| UNK-01 | Full-history **DB size** and whether it fits an in-browser download (OPFS) vs must use range-requests | §4a serving model | **SPK-opengov-atlas-002** (build + measure); §4c | Low — architecture already supports both via one abstraction; size only selects the variant |
| UNK-02 | Do **pre-Asset-Hub-migration** referenda/votes decode from the `polkadot` relay archive (older runtimes)? | §3a history depth | Bounded spike against `polkadot` gateway before Architecture freeze (or scope MVP to Asset-Hub-era + recent history) | Medium — bounds how far back MVP history goes (PO A-06) |
| UNK-03 | **Split / SplitAbstain** vote variants (not seen in SPK-001 sample) | §3a adapter/contract | Handle all three variants in the data contract; verify against a captured Split vote during implementation | Low — known pallet shapes [E2] |
| UNK-04 | SQD archive **key/rate** economics for a full backfill (`50 req/10s/IP`, key required) | §3a/§4b | Owner key in hand; backfill is chunky and infrequent (offline) — throttle the processor conservatively | Low — offline batch, not hot path |
| UNK-05 | Preimage `bytes` → pallet·method·args **decode** across spec versions | §3e | `@polkadot/api` registry decode at build time; raw view as fallback (CAP-009) | Low — decode libraries are mature |

## 6. Recommendation  ⚠ FREEZE GATE

- **Recommended stack:** **TypeScript** end-to-end · **`@subsquid/substrate-processor`** backfilling the SQD keyed archives for `asset-hub-polkadot` (governance) + `people-chain` (identity) [+ `polkadot` relay for pre-migration history, pending UNK-02], with **`@polkadot/api`** for current-state/preimage decode and the deferred live-sync tail · **SQLite** local store (indexed edge tables, single-hop point lookups) built offline and published as a **static asset** · **React + React Flow + Zustand + Tailwind (Vite)** frontend [E3-reused] · served as a **static SPA reading the SQLite via WASM (range-requested primary; full-OPFS variant if small; Next.js server-read fallback)** on a **free static host**. The indexer axis is decided on **[E1] executed evidence** (SPK-001, frozen).
- **Runner-up stack & the argument that defeated it:** **SubQuery (`@subql/node`) + PostgreSQL + hosted API** was the closest *indexer+store* alternative. It lost because (a) SubQuery is unproven for these exact chains here while Subsquid is proven [E1], and (b) a hosted Postgres+API breaks the $0 ceiling (D-03) and puts a network hop in a path that must be single-digit-ms (D-02). The local-SQLite-as-static-asset model is what makes "$0 + instant + no third-party API in the hot path" simultaneously satisfiable.
- **Flip conditions:** (1) SPK-002 shows the DB is too large to range-request acceptably → shift to Next.js server-side reads (§4a fallback), a one-module change; (2) UNK-02 shows the relay archive won't decode old runtimes → scope MVP history to the Asset-Hub era + a bounded relay window; (3) a future deep-pathfinding feature appears (PO §5 non-goal today) → reconsider a recursive-query-capable store; (4) SQD archive drops Asset-Hub/People coverage → activate the SubQuery fallback.
- **Spikes required before Architecture freeze:** **SPK-opengov-atlas-002** (local SQLite build + single-hop latency + DB size — resolves UNK-01, operationalizes PO §7's latency & backfill metrics). UNK-02 (pre-migration relay decode) is a bounded spike or an explicit MVP-history-scope decision at Architecture — recorded as an owner risk-acceptance if not spiked (full-profile rule).

## 7. Q&A Resolution Log (Brainstorming capability)

N/A — `technical_only` route (detailed overview); no exploratory product Q&A. Data-source feasibility was resolved by executed spike SPK-opengov-atlas-001 rather than Q&A.

## 8. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | product | approve | Scope respected (technical_only). Confirmed the owner's two settled boundaries (archive-not-REST; executed-evidence indexer) are treated as constraints, not re-opened. Every axis maps to a PO §6 driver. Non-blocking: verify at Architecture that CAP-010/011/013 (deep-link, global search, influence readouts) are all expressible as single-hop SQLite queries so the store choice doesn't quietly force a non-goal deep-traversal. |
| 2026-07-07 | architecture | approve | ISS-FM-A1 (resolved): every non-[E1] axis is either evidence-backed or flip-conditioned; the data-access abstraction (§4a, adopting E3 ADR-01) keeps the serving-model contingency to one module. No unresolved trade-off records. Backfill-as-offline-batch (§4b) correctly avoids a hosted indexer that would break $0. Carry into ARCHITECTURE_SPEC: name the one data-access boundary and enforce it with a dependency-lint. |
| 2026-07-07 | security | approve | Attack surface is small: read-only public chain data, no auth, no PII (on-chain pseudonymous keys). Two non-blocking carries: (SEC-1) the **SQD API key** is a secret used only by the *offline backfill*, never shipped to the browser or the static bundle — Architecture §6 must state this explicitly; (SEC-2) preimage/identity text is externally-authored — decoded call args and display names must be rendered without raw-HTML injection (reuse E3 AS-gov-graph-001 §6 sanitization rule). |
| 2026-07-07 | performance | approve | Performance claims are [E1] (SPK-002), satisfying the high-tier evidence rule. Mandatory carry-forward (same as gov-graph): the browser hot path (WASM SQLite + range-request RTT) and full-backfill size/duration are **not yet measured** — ARCHITECTURE_SPEC §5 must name executable benchmarks for each or they remain unverifiable (SUG-SPK2-P1). |
| 2026-07-07 | harness (full-profile gap-analysis) | no blocking gap | Post-produce discover pass: all 5 SPK-001 validity limits and the SPK-002 browser-path gap are carried into §5 UNK rows with owners/resolution; no axis is decided on [A]-only evidence (indexer & store are [E1]; frontend axes are [E3]-reused; serving-model is [E1]+flip-conditioned). |

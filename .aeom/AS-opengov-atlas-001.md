---
artifact_id: "AS-opengov-atlas-001"
artifact_type: architecture_spec
project: "opengov-atlas"
version: 0.5.1
state: frozen
risk_tier: high
depends_on: ["PO-opengov-atlas-001", "FM-opengov-atlas-001", "SPK-opengov-atlas-001", "SPK-opengov-atlas-002"]
supersedes: null
owners: ["Parikshit"]
---

# Architecture Specification — OpenGov Atlas

> Realizes the frozen Feasibility Matrix; does not relitigate it. Every quality attribute in §5 names its deterministic verification. Domain modelling follows real Polkadot OpenGov semantics (Harness acts as the Polkadot domain expert, per PO §6); domain corrections carried from gov-graph are cited [E3].

## 1. Context & Scope

- **System context (C4 L1):**
```
                         BUILD TIME (offline batch, run locally/CI — $0, not hosted)
[SQD keyed archive: asset-hub-polkadot]──┐
[SQD keyed archive: people-chain]────────┼─▶ [Backfill Indexer (@subsquid/substrate-processor)]
[SQD keyed archive: polkadot relay*]─────┘        │  decode + map + @polkadot/api preimage/track decode
[Asset Hub RPC / People RPC]──(metadata, current-state tally/track consts)─┘
                                                   ▼
                                          [SQLite artifact  (atlas.db, versioned)]
                                                   │  COMMITTED TO GIT (public/atlas.db, ~19MB)
                         QUERY TIME (runtime — Vercel hobby static host, no server, no API)
[User] ─▶ [Static SPA: React + React Flow]  ──▶ [Data Access Layer] ──▶ [whole atlas.db → OPFS/in-memory → WASM SQLite (local)]
                                                                              └▶ (only if DB > 75MB: static HTTP range-requests — still no server)
```
*relay-chain archive only for pre-migration history, gated on SPK-003 (UNK-02).

- **In scope (this version):** CAP-001–009, 011 (Must) + the local backfill/index pipeline. CAP-010/012/013/014 (Should) are architected-for but sliced later; CAP-015 (Could) and live-sync are out.
- **Out of scope:** all PO §5 non-goals (governance execution, whole-graph render, deep transitive pathfinding, analytics dashboards, multi-chain, live sync, non-OpenGov tracks).
- **Upstream frozen inputs:** PO-opengov-atlas-001 (v0.1.0), FM-opengov-atlas-001 (v0.1.0), SPK-001 (v0.1.0), SPK-002 (v0.1.0).

## 2. Architectural Drivers

| Driver | Source | Architectural consequence |
|---|---|---|
| Archive-not-REST; indexer = Subsquid | FM D-01 / §3a [E1] | A single **Backfill Indexer** is the only component that talks to SQD/RPC; it runs at build time, never in the query hot path. No REST client anywhere. |
| Single-hop, single-digit-ms reads | FM D-02 / SPK-002 [E1] | Storage is typed **bidirectional edge tables indexed on both endpoints**; the **Data Access Layer** exposes only single-hop neighbour queries + cluster aggregates — never multi-hop traversal. |
| $0 free static host — **Vercel hobby, DB-in-git** | FM D-03 / owner directive | No hosted server/DB/API. The measured **shipped ≈19 MB** `atlas.db` (raw preimage bytes stripped, ADR-09) is **committed to the git repo and deployed to Vercel hobby as a static asset** (ADR-10); the browser loads it whole into OPFS/in-memory and queries locally (WASM, ADR-08). No serverless functions. Backfill is an offline batch (ADR-01). |
| Solo React/TS team | FM D-04 / [E3] | Frontend reuses gov-graph's proven React+React Flow+Zustand+Tailwind+Vite; blockchain specifics are isolated in the build-time indexer so the SPA deals only in plain typed rows. |
| Full history, atomic store | FM D-05 | Every vote/delegation/referendum/preimage/identity is its own row; nothing pre-aggregated at rest (aggregation is a query concern). |
| Governance on Asset Hub, identity on People | FM D-06 / SPK-001 [E1] | Indexer targets `asset-hub-polkadot` + `people-chain` (+ relay for old history); accounts join across chains by SS58 key. |
| Serving-model contingency (range-request vs OPFS vs server) | FM §4a flip-condition | The **Data Access Layer** is a single abstraction so the serving choice changes one module (adopts E3 AS-gov-graph-001 ADR-01). |
| Per-track delegation (domain correction) | PO §5.2 / [E3 — AS-gov-graph-001 ADR-02] | Delegation modelled as one edge per (delegator, delegate, **track**) — never a single global delegate edge. |
| Whale + cluster at scale | PO §6.4 | Vote expansion = top-N-by-effective-weight individual nodes + one aggregate "Minority" node + a paginated searchable sidebar — never thousands of nodes. |

## 3. Component Model (C4 L2–3)

| Component | Responsibility | Owns data? | Depends on | Rejected alternative & why |
|---|---|---|---|---|
| **Backfill Indexer** (build-time) | The only component that reads SQD archives/RPC; decodes governance+identity events/calls and writes rows to `atlas.db`; tracks last-synced block for resume | Yes — raw decoded governance data | SQD archives, RPC, @polkadot/api (preimage/track decode) | A hosted, always-on indexer service — rejected: breaks $0 (FM §4b); MVP freshness need is a periodic rebuild, not live |
| **Decode/Adapter** (build-time lib) | Maps archive JSON → schema rows: vote-byte→(direction,conviction), Standard/Split/SplitAbstain variants, delegation source-combine (event+call), preimage bytes→pallet·method·args, identity Raw→UTF-8, effective_weight = balance×conviction | No (pure functions) | @polkadot/api registry | Trusting archive shapes implicitly — rejected: variants (Split/SplitAbstain, UNK-03) and cross-runtime shapes must be explicitly handled (SPK-001 §4) |
| **SQLite Schema/Builder** (build-time) | Defines entity + typed edge tables and both-endpoint indexes; emits the versioned `atlas.db` static artifact + a manifest (schema version, block range, row counts) | Yes — the store schema | Decode/Adapter | Server DB (Postgres) — rejected in FM §3b ($0) |
| **Data Access Layer (DAL)** | The **only** query-time module that opens the SQLite (**ship-whole-to-OPFS primary**, ADR-08/10; static range-request the only >75 MB fallback — no server) and exposes single-hop `neighbours(nodeId)` + cluster aggregates + entity detail | No (reads only) | WASM SQLite / static committed asset | Querying the DB from every component — rejected: couples all UI to the serving-model contingency (ADR-01 [E3]) |
| **Graph Model** | Canonical node/edge types; identity-stable node ids (`referendum:<i>`, `account:<addr>`, `track:<id>`, `preimage:<hash>`, `vote:<addr>:<poll>`, `delegation:<addr>:<track>`); already-visited detection | No | — (pure types) | Path-stable nodes — rejected: PO §6.3.1 requires identity-stable canonical nodes so loops are legible |
| **Traversal/Neighbours Service** | Given the current center, asks the DAL for its immediate typed neighbours across all relations; applies whale/cluster summarization for votes | No | DAL, Graph Model | Multi-hop/transitive expansion — rejected: PO §5 non-goal; single-hop only |
| **Graph Canvas** (React Flow) | Renders exactly one center + its neighbours; value-coded vote nodes (hue=direction, size/intensity=effective weight, direct vs delegated); re-center on click; collapse prior view | No | Traversal Svc, State Store | D3/Cytoscape — rejected in FM §3c [E3] |
| **Referenda List + Detail** | Paginated/searchable/filterable (track,status) sortable list (CAP-001); split-layout detail pane (CAP-002) | No | DAL, State Store | — |
| **Cluster Sidebar** | Paginated, address/identity-searchable list of the Minority cluster; re-centers on any voter (CAP-005) | No | DAL, State Store | Rendering all voters as nodes — rejected: hairball (PO §6.4) |
| **History/Breadcrumb + Back** | Ordered path of centers (loops allowed); Back restores prior center; clickable breadcrumb (CAP-007) | Yes — navigation journey (UI state) | State Store | Browser-history-only — rejected: journey is a first-class ordered structure with loops |
| **Search + Deep-link** | Global referendum/account search (CAP-011); URL per center (CAP-010) | No | DAL, State Store, Router | — |
| **State Store (Zustand)** | UI/interaction state: current center, expansion state, sidebar, breadcrumb, filters | Yes — UI state only | — | React Context — rejected in FM/[E3] (re-render risk vs D-02) |

**Dependency direction rules:** UI components depend on DAL / Traversal Service / State Store — never on each other directly; the Backfill Indexer/Decode/Builder are build-time only and MUST NOT be importable from SPA (`src/`) code. Enforced by a `dependency-cruiser` rule in CI (executable check, QA-11).

## 4. Data Architecture

- **Ownership:** the `atlas.db` SQLite artifact is the single owner of all governance entities (referendum, track, account, identity, preimage) and typed edges (vote, delegation, runs_on, enacts, submitted_by, pays). The State Store owns UI state only. Build-time components own the *production* of the DB; query-time components only read it.
- **Schema:** authoritative DDL is **CON-001 §1 (optimized, ADR-09)** — addresses interned to `account(id pk, pubkey BLOB unique, display, judgement, parent_id)`; edges store integer FKs (`vote(voter_id, poll, direction, …)`, `delegation(delegator_id, delegate_id, track, …)`) indexed on **both** endpoints; amounts REAL planck; enums INTEGER; `track` from runtime consts (@polkadot/api). "Neighbours of X" is an indexed point lookup in either direction — no chain is ever followed at rest (PO §8). The DAL resolves internal ids to SS58 at its boundary.
- **Consistency model:** eventual, bounded by rebuild cadence. Acceptable because Atlas is read-only (PO §5 non-goal: no writes); a stale row can never cause a bad transaction. The manifest records the block range so the UI can show "data current as of block/date."
- **Schema evolution & migration:** the DB is a *versioned build artifact*, not a live-migrated DB. The Decode/Adapter is the only place raw archive shapes are read; a schema-version field in the manifest lets the SPA refuse an incompatible DB. Runtime-upgrade/spec-version differences (Gov1 vs Gov2, pre/post Asset Hub) are handled in the Adapter (UNK-02/SPK-003).
- **Retention, privacy, residency:** only public, pseudonymous on-chain data; no PII, no accounts, no user data collected. The **SQD API key is a build-time secret only** — it is never bundled into the SPA or the published static assets (QA-10). Traces to PO §6 (regulatory N/A, no residency constraints).

## 5. Quality Attribute Scenarios  ⚠ VERIFICATION CONTRACT

| ID | Attribute | Scenario (stimulus → response → measure) | Target | Verified by (deterministic check) |
|---|---|---|---|---|
| QA-01 | Single-hop latency (browser) | User expands a node → DAL returns immediate neighbours via WASM SQLite over the ship-whole/OPFS DB (ADR-08) | ≤ single-digit ms compute (local; no per-hop network). **Fallback hard gate** if DB > N and range-request path is used: p95 ≤ 150 ms/hop over a **throttled** connection, else fall back to ship-whole-OPFS/server | Playwright perf-mark over the real WASM DAL in-browser (extends SPK-002's 0.008–0.17 ms; SPK-003 §3i confirmed ≪1 ms on the full-scale optimized DB) |
| QA-02 | Backfill completeness & resume | Backfill runs, is interrupted, and resumes from last-synced block | Row counts reconcile vs chain (referendumCount, sampled referenda); resume adds no duplicates/gaps | Backfill integration test: checkpoint→kill→resume, assert row-count reconciliation + unique-edge constraints |
| QA-03 | Shipped-DB size | Full-history backfill + publish (bytes stripped) completes | Shipped DB ≤ **N = 75 MB** ⇒ ship-whole primary (**measured ≈ 19 MB**, ADR-08); above N ⇒ range-request path | Build step emits DB bytes + manifest; CI asserts shipped size ≤ 75 MB **and no non-null `preimage.bytes`** (SPK-003 §3f / DIS-002 D-10 measured build 35.7 / shipped 15.3 MB @85%) |
| QA-04 | Whale/cluster correctness | Expand Votes on a referendum with N **distinct** voters (real max **ref 453 = 751 voters**; votes deduped to latest per voter) | **Top-9** by **effective_weight = balance×conviction** rendered individually; remainder = one aggregate node whose (count, Σweight, aye/nay split) equals the actual remainder | Contract test over the **real captured Split/SplitAbstain/Standard fixtures** (`CON-002_vote_variant_validation.json`) + ref-453 ground truth: assert dedup-to-latest, top-9 ordering (36.5% share) + aggregate "+742" equals SQL truth |
| QA-05 | Per-track delegation correctness | Expand an account delegating on ≥2 tracks | One delegation node per (account, **track**) — never a merged single edge | Unit test on a fixture account with multi-track delegations, asserting per-track cardinality [E3 — QA-07 gov-graph] |
| QA-06 | Identity join | Account reached in the graph has a People-chain identity | Display name resolved from `identity` join by SS58 key; no-identity accounts show truncated address gracefully | Contract test: fixture People-chain identity joins to an Asset Hub account; assert display + graceful fallback |
| QA-07 | Preimage decode | Open a Proposal node whose preimage is available | Decoded pallet·method·key-args shown (raw view available); treasury calls show beneficiary+amount | Unit test decoding a captured preimage `bytes` fixture → asserted pallet·method (SPK-001 payloads) |
| QA-08 | Traversal identity-stability, loops & breadcrumb collapse | Reach the same account via two paths; a traversal re-enters a node already in the breadcrumb | Same canonical **address-based** node id both times (never an internal integer id); already-visited flagged; **breadcrumb auto-collapses to the earlier occurrence** (truncate to `indexOf+1`) instead of growing | Unit test on node-id derivation + already-visited + breadcrumb-collapse over a cyclic fixture (SPK-003 §3g walked a real loop) |
| QA-09 | Vote value encoding | Render vote nodes of differing direction/weight | Hue encodes direction (Aye/Nay/Split/Abstain); size/intensity encodes effective weight; direct vs delegated distinguished | Component test asserting encoding maps from row fields (not ad-hoc) |
| QA-10 | Secret never shipped | Build the SPA + publish assets | The SQD API key appears in **no** client bundle or published asset | CI grep/secret-scan over `dist/` fails the build on any key/token match |
| QA-11 | Component-boundary integrity | Any commit | No UI→UI cross-imports; no build-time indexer import from SPA `src/` | `dependency-cruiser` ruleset in CI |
| QA-12 | Accessibility baseline | Keyboard/screen-reader user navigates canvas + panels + sidebar | Nodes keyboard-reachable/selectable; panels readable; WCAG 2.1 AA contrast; 0 critical/serious axe violations | `@axe-core/playwright` gating CI [E3 — QA-04 gov-graph; PO A-12] |
| QA-13 | $0 static deploy (Vercel hobby, DB-in-git) | Push to main | Static build (SPA + committed `public/atlas.db`) deploys to **Vercel hobby**; deployed URL 200s; the `atlas.db` static asset 200s; a traversal works against it; **no serverless function is deployed** | CI/CD status + post-deploy smoke test (Playwright against live deployment) |
| QA-14 | Content sanitization | Render preimage-decoded text / identity display names (externally authored) | No raw HTML/script from upstream reaches the DOM | Security test with hostile-markup fixture asserting no raw HTML survives (reuse E3 AS-gov-graph-001 §6 rule) |

## 6. Cross-Cutting Concerns

- **Auth & authorization:** none. Fully public, read-only, no accounts (PO §6).
- **Observability:** MVP baseline — build-time indexer logs row counts + last block to the manifest; a top-level React error boundary console-logs render errors. No third-party APM (unrequested; D-03/D-07). [A — §10 A-20]
- **Failure handling & degradation:** if a range-request/page fetch fails, the DAL retries then surfaces an explicit "couldn't load this view" state (never a silent blank canvas); the UI always shows the manifest's "data as of" so staleness is honest. Missing optional data (no identity, unavailable preimage, refunded-deposit proposer gap [E3 — DIS-gov-graph-014]) degrades to a labeled placeholder, not an error.
- **Configuration & secrets:** the **SQD API key** and RPC URLs are build-time env only (`SQD_API_KEY`), never `VITE_`-prefixed, never in the published bundle (QA-10). The published static assets contain only the read-only `atlas.db` + SPA.
- **Content rendering & sanitization:** preimage-decoded arguments and identity display names are externally authored; render as text/Markdown-without-raw-HTML; any HTML path must pass an allow-list sanitizer first (reuse E3 AS-gov-graph-001 §6; QA-14).

## 7. Contracts Plan

| Contract | Type | Between | Risk tier |
|---|---|---|---|
| CON-001 SQLite Schema & Typed Edge Model | schema (DDL + row types + indexes + manifest) | Backfill Builder ↔ DAL ↔ all UI | High — architecture-defining; drives QA-01/04/05 |
| CON-002 Data Access Layer API | interface (single-hop `neighbours(nodeId)`, `clusterAggregate`, `entityDetail`, `search`) | DAL ↔ Traversal/UI | High — the serving-model isolation boundary (ADR-01) |
| CON-003 Backfill Decode Mapping | schema+rules (archive JSON→rows: vote-byte, Split/SplitAbstain, delegation combine, effective_weight, preimage decode, identity Raw) | SQD/RPC ↔ Decode/Adapter | High — correctness of all data (QA-04/05/07); grounded on SPK-001 captured payloads |
| CON-004 Node/Edge Graph Model & Node-ID Scheme | schema + state machine (node types, valid edges, expansion/already-visited states) | Graph Model ↔ Canvas ↔ Panel ↔ Traversal | High — drives QA-08 |
| CON-005 URL / Deep-link State | schema (center-node ↔ URL) | Router ↔ State Store | Medium |
| CON-006 Zustand Store | schema (typed store) | State Store ↔ UI | Medium [E3-reuse] |

## 8. Implementation Strategy Seed

- **Build order & rationale:**
  1. **SPK-opengov-atlas-003** (bounded relay-archive decode / MVP history-scope decision — UNK-02) — run before committing history depth.
  2. **CON-003 Decode/Adapter + CON-001 Schema/Builder** → produce a real `atlas.db` from a bounded backfill (the foundation; validates SPK-001 shapes at scale).
  3. **CON-002 DAL** (WASM SQLite range-request read path) + a tiny query harness — proves QA-01 in-browser early.
  4. **Referenda list + split layout (CAP-001/002)** + **CON-004 Graph Model** + **Graph Canvas** rendering a Referendum center + immediate neighbours — the **walking skeleton**.
  5. **Deploy the skeleton to the free static host (CAP-016)** now — retire deployment/$0/asset-size risk early (QA-13/QA-03), not last.
  6. **Focused traversal + re-center + breadcrumb/Back (CAP-003/007)**.
  7. **Whale + Minority cluster + sidebar (CAP-005/006)** with value encoding.
  8. **Recursive account expansion + per-track delegation (CAP-004)** — the recursive heart; built once CON-004 is proven.
  9. **Preimage inspector (CAP-009)**, **search + deep-link (CAP-011/010)**.
  10. **Accessibility hardening pass (QA-12)** — continuous, plus a dedicated pass.
- **Must be spiked before implementation begins:** SPK-003 (relay-archive pre-migration decode / history scope, UNK-02). All other axes are [E1]/[E3]-resolved.
- **Definition of Done (`implemented → verified`):** every QA-01–QA-14 deterministic check passes in CI, and each in-scope CAP is demonstrated against the **real published `atlas.db`** (not mocks) at least once.

## 9. Architecture Decision Log

| ADR ID | Decision | Alternatives rejected | Evidence | TOR? |
|---|---|---|---|---|
| ADR-01 | Backfill is an **offline batch** producing a versioned SQLite artifact; no hosted indexer/DB. **The `atlas.db` is a STATIC snapshot committed to the git repo** (not a frequently-rebuilt/dynamic DB) — rebuilt manually/occasionally and re-committed (owner directive 2026-07-08). | Always-on indexer service; dynamic/frequently-updated DB | [E1 — SPK-001; FM §4b]; $0 (D-03); owner directive | No |
| ADR-02 | Storage = **typed bidirectional edge tables** in SQLite; single-hop point lookups only | Graph DB; multi-hop store | [E1 — SPK-002; PO §8] | No |
| ADR-03 | WASM SQLite behind one DAL; **serving model selected by measured size (ADR-08)** — superseded-in-part by ADR-08 | Hosted API | [E1 — SPK-002; FM §4a] | No |
| ADR-04 | Individual **votes/delegations sourced from events** on Asset Hub (`Voted`/`Delegated`, explicit `who`), enriched by calls/storage. **Relay pre-migration caveat [E1 — SPK-003/DIS-001]: no `Voted` event exists → votes sourced from the `vote` call (origin=voter); relay `Delegated` is 2-arg → delegation from the `delegate` call.** Era-conditional in the adapter (CON-002). | Sourcing AH votes from calls' origin | [E1 — SPK-001 proxy/batch hides origin; SPK-003 relay has no event] | No |
| ADR-05 | One **delegation node per (delegator, delegate, track)** | Single global delegate edge | [E2/E3 — real OpenGov; AS-gov-graph-001 ADR-02] | No |
| ADR-06 | **Whale top-9-by-effective-weight + one aggregate Minority node + paginated searchable sidebar**; influence = `effective_weight`; any node→`entityDetail` sidebar | Render all voters | [E1 — SPK-003 §3h: on the busiest real referendum by distinct voters (ref 453, 751 voters) top-9 hold 36.5% of weight, remainder → one "+742" node; PO §6.4] | No |
| ADR-07 | Reuse gov-graph frontend (React/React Flow/Zustand/Tailwind/Vite) | Re-evaluate from scratch | [E3 — FM-gov-graph-001; same constraints] | No |
| **ADR-08** | **Serving = ship the whole *shipped* `atlas.db` (≈19 MB, measured) as a static asset, load once into OPFS/in-memory, query locally** (SPK-002's ≪1 ms applies directly, no per-hop RTT). At ≈19 MB ≤ threshold N = 75 MB with ~4× headroom this is the **sole MVP model**. Fallback if the DB ever exceeds N: **static range-requested SQLite** (still no server), gated by the QA-01 hard p95/hop latency budget. The **server-side-read fallback is REMOVED** by the owner's no-backend constraint (ADR-10). Swap lives entirely behind the DAL. | Range-request primary (now vestigial fallback); any hosted/server read | [E1 — SPK-003 §3f real measured size; SPK-002 latency; owner directive] | No |
| **ADR-09** | **Interned-integer storage + build/shipped split:** addresses → auto-increment `account.id` (pubkey stored once as BLOB, SS58 at display); amounts → **REAL planck** (i64-overflow-safe); enums INTEGER; hashes/pubkeys BLOB. Raw `preimage.bytes` (53% of the build DB) is a **build-only decode input dropped from the shipped DB** — the biggest single size lever. Node ids/URLs stay **address-canonical** (ids not rebuild-stable). Cuts DB ~91 MB baseline → **~42 MB build / ~19 MB shipped**. | TEXT addresses/balances; ship raw bytes | [E1 — SPK-003 §3e-f measured; DIS-002 D-10; owner directive] | No |
| **ADR-10** | **Deployment = fully static, no backend (owner directive 2026-07-08):** the ≈19 MB shipped `atlas.db` is **committed to the git repo** (under `public/`) and deployed to **Vercel hobby tier** as a static asset alongside the SPA — **no serverless functions, no API routes, no hosted DB**. 19 MB sits well under GitHub's 50 MB warning / 100 MB limit; Vercel serves it via a normal static GET (range-capable). *Tradeoff:* each rebuild adds a ~19 MB blob to git history — acceptable for an occasionally-rebuilt static snapshot (ADR-01); **if rebuilds become frequent, switch the DB to Git LFS or a release asset** (one-line change, DAL fetch URL only). | Serverless/API backend; external DB host; dynamic DB | owner directive; [E1 — SPK-003 shipped size fits git/Vercel] | No |

## 10. Assumptions & Open Questions  ⚠ FREEZE GATE

| ID | Assumption / Question | Blocking? | Resolution path | Owner | Status |
|---|---|---|---|---|---|
| A-06 | MVP history depth & cross-runtime decode | No | **RESOLVED [E1] — SPK-003:** relay pre-migration decodes via Subsquid (era-conditional, DIS-001); full history (all 1,919 referenda) fits **~19 MB shipped** so **MVP = full history**, no bounded window needed | Parikshit | **Resolved (full history)** |
| UNK-03 | Split / SplitAbstain vote variants | No | **RESOLVED [E1] — SPK-003 §3c:** both real (912 / 16,450), captured, decode with correct effective_weight (`CON-002_vote_variant_validation.json`) | Parikshit | **Closed** |
| A-15 | Track parameters (curves/periods) come from runtime consts, not events | No | Build track registry via @polkadot/api consts (or static registry [E3]) in the Builder | Parikshit | Accepted (design) |
| A-16 | Full-DB size within static-host asset budget | No | **RESOLVED [E1] — SPK-003 §3e/f + DIS-002 D-10:** measured full-history **shipped** DB ≈ 19 MB (optimized + bytes-stripped, ADR-09) ≤ N=75 MB ⇒ ship-whole primary (ADR-08) | Parikshit | **Resolved (~19 MB shipped)** |
| A-17 | In-browser query latency stays within QA-01 target | No | With ship-whole (ADR-08) the DB is local after first load ⇒ SPK-002's ≪1 ms applies directly (no range-fetch RTT); QA-01 confirms in-browser WASM in slice 2 | Parikshit | Mitigated (ADR-08) |
| A-18 | "Value" encoding = conviction-weighted effective power (recommended default) | No | Design detail; encode `effective_weight` (PO A-08) | Parikshit | Accepted (default) |
| A-19 | Whale threshold (fixed top-N vs %-turnout vs adjustable) | No | Design detail (PO A-09); start fixed top-N, configurable | Parikshit | Accepted (default) |
| A-20 | Observability = console/error-boundary only for MVP | No | Revisit if real usage needs error visibility [E3] | Parikshit | Accepted (MVP default) |

## 11. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | harness (A2 discover gap-analysis) | no blocking gap | Requirement coverage: CAP-001–011,016 trace to §3/§5; CAP-012 covered by account-expansion+delegation edges; CAP-013/014 (Should) are served by DAL aggregates + detail pane, sliced later (not omitted). Constraint echo: every PO §6 constraint leaves a §2 mark. Prior-project scan (gov-graph): reused per-track delegation (ADR-05), sanitization (QA-14), Asset Hub migration (DIS-013), refunded-deposit proposer gap (§6 degradation, DIS-014); folded DIS-gov-graph-016's null-vs-undefined lesson into CON-003 (adapter must tolerate `null` and all vote variants). Two contract-level refinements carried to Contracts (non-blocking): (G1) CON-001 needs an index on `account.display` for identity search (CAP-011); (G2) the Traversal Service needs read access to the journey to mark already-visited (CON-004/QA-08). |
| 2026-07-07 | architecture | approve | Component boundaries clean; the single DAL isolates the serving-model contingency (ADR-01/03) and build-time-vs-query-time separation is enforced deterministically (QA-11). Single-hop-only storage (ADR-02) correctly forecloses the deep-traversal non-goal. No unresolved TOR. Endorses carries G1/G2 to Contracts. |
| 2026-07-07 | security | approve | ISS-AS-S1 (resolved in-spec): the SQD key is build-time-only and QA-10 fails the build if it appears in any published asset — the key-never-shipped concern from FM SEC-1 is now a deterministic gate. QA-14 covers externally-authored preimage/identity text (SEC-2). Attack surface remains minimal (static, read-only, no auth, no PII). |
| 2026-07-07 | performance | approve | High-tier evidence rule satisfied: QA-01 (browser WASM+range-fetch), QA-02 (resume), QA-03 (true DB size) name executable benchmarks that convert SPK-002's native [E1] into deployed-path verification. Non-blocking: QA-04's whale top-N must use the `(poll, effective_weight desc)` composite index (already in §4) so it stays a bounded indexed read, not a full-scan sort. |
| 2026-07-07 | quality | approve | Every QA-01–QA-14 names a concrete deterministic check and each CON is precise enough to support contract/unit tests; DoD requires demonstration against the real published `atlas.db`, not mocks (directly answers the standing memory guidance on verifying real round-trips). No blocking issues. |
| 2026-07-07 | architecture + performance + quality (v0.2.x change, evidence DIS-001/SPK-003) | approve | ADR-08 flips serving to **ship-whole-to-OPFS** on the [E1] measured ~32 MB DB ≤ 75 MB, eliminating the per-hop range-fetch RTT (QA-01 now local; fallback keeps a hard p95/hop gate). ADR-09 interned storage is measured, not asserted. ADR-04 relay caveat is the real cross-runtime finding. A-06/16/17/UNK-03 resolved with evidence; breadcrumb loop-collapse (QA-08) proven on a real recursive walk. No unresolved TOR. |
| 2026-07-08 | architecture + performance + quality (v0.3.0 change, evidence DIS-002/SPK-003) | approve | Projection→measurement: the **shipped** DB is **~19 MB** (build ~42 MB), not ~32 MB — raw `preimage.bytes` (53% of build) is build-only and stripped (ADR-09), so ADR-08 ship-whole holds with ~4× headroom. QA-04 now binds real ref-453 ground truth (751 voters, top-9 36.5% + "+742") and asserts **dedup-to-latest** per voter; QA-03 adds a no-`preimage.bytes` CI assertion. Decisions unchanged; numbers corrected to measured. |
| 2026-07-08 | architecture + security (v0.4.0 change, owner directive) | approve | Owner pinned the deployment substrate: **static `atlas.db` committed to git, deployed on Vercel hobby as a static asset, no backend/serverless** (ADR-10). This is the ship-whole model ADR-08 already selected — the ~19 MB shipped size (thanks to the ADR-09 bytes-strip) fits git comfortably (<50 MB warn) and Vercel serves it directly. ADR-08's server-read fallback is removed (no backend); static range-request remains the only >75 MB fallback. ADR-01 hardened to a static-snapshot artifact; QA-13 pins Vercel + a no-serverless assertion. Attack surface shrinks further (pure static, read-only). Git-history-bloat tradeoff disclosed with a Git-LFS escape hatch. |

# OpenGov Atlas — Buildable Plan (implementation-ready)

*Prepared by the AEOM Harness, 2026-07-07. Profile: **full**. Owner: Parikshit. All knowledge-phase artifacts are **frozen**; the executed proof-of-feasibility gate the overview demanded is **discharged with real captured data**, now including a full-history relay+Asset-Hub decode, a real measured database, and an empirical graph-closure proof.*

## 1. Problem & product (plain language)

Polkadot OpenGov is richly relational — referenda, tracks, conviction-weighted votes, per-track delegation, preimage proposals — but existing explorers flatten it into lists and hex. **OpenGov Atlas** lets you *traverse* governance as a graph: start at a referendum and walk one node at a time to its proposal, track, votes, the accounts behind them, and the delegation relationships that shaped them — recursively and self-referentially (a walk can loop back to where it started, and the breadcrumb collapses the loop). Two commitments: **focused traversal** (one center + its immediate neighbours, breadcrumb to walk back) and a **complete local index** so every hop resolves against a local store in well under a millisecond — no third-party API in the hot path.

## 2. The decisive proof (why this plan is trustworthy)

The overview set one hard gate: *feasibility is established by running code, not reading docs.* Discharged with real endpoints and captured payloads (preserved at `.aeom/spikes/captured-payloads/`):

- **SPK-001** ran `@subsquid/substrate-processor` against the keyed SQD archives and decoded every entity Atlas needs from **Asset Hub** governance + **People** identity.
- **SPK-002** measured indexed single-hop reads at **0.008–0.17 ms** on a real local SQLite.
- **SPK-003 (this round)** closed every remaining risk against **real code**: it ran the processor over the **`polkadot` relay archive** and proved the pre-migration runtime decodes all entities; **censused all history** (exact counts below); **built and VACUUM-measured a real optimized `atlas.db`** from the downloaded data (preserving it as a hydration seed); and **walked the full recursive graph** on real rows with no dead-ends, including a loop that triggers breadcrumb collapse.
- **Contracts are machine-validated against real data** (`CON-002_vote_variant_validation.json` integrity_check ok; `SPK-003_measurements.json`; `graph_closure_analysis.json`), not asserted. Two correctness findings from the real build were folded back into the contracts (DIS-002): **de-dup votes to the latest per (voter, poll)** and **strip build-only raw preimage bytes from the shipped DB**.

**Exact full-history census (all 1,919 referenda):** relay era = 1,782 referenda (indices 0–1781); Asset Hub = 137 (1782–1918). **227,246 vote *calls*** (Standard 209,884 / Split 912 / SplitAbstain 16,450) → **≈205 K distinct latest votes** after de-dup (one automated re-voter alone cast 1,550 on a single referendum), **25,943 delegations**, **2,462 preimages**. The relay era is ~93% of all governance. Real graph completeness: **100% of referenda have a proposer**, **99.5% of Lookup referenda have their preimage available**.

## 3. Chosen stack (with rationale & rejected options)

| Layer | Choice | Why (evidence) | Rejected |
|---|---|---|---|
| Data source | **@subsquid/substrate-processor** over the SQD keyed archive: `asset-hub-polkadot` + `people-chain` + **`polkadot` relay** (pre-migration history) | The **only** indexer proven end-to-end here [E1 — SPK-001/003]; owner directive: indexer, **not REST** | **SubSquare/Subscan REST** (owner-rejected [E3]); **SubQuery** (unproven here — fallback); **direct RPC scrape** (~10⁶× too slow [E1]) |
| Language | **TypeScript** end-to-end | Spans indexer + decode + frontend + in-browser SQLite [E1/E3] | Rust/Python (team-fit; not the browser language) |
| Local store | **SQLite — optimized schema** (interned integer account ids, REAL-planck amounts, integer enums, BLOB pubkeys/hashes; typed edge tables indexed both ends; one canonical vote per voter/poll) | $0, embedded, single-hop 0.15–1.7 ms measured; **interning + bytes-strip cut the full DB ~91 MB baseline → ~42 MB build / ≈19 MB shipped** [E1 — SPK-003 §3e-f / DIS-002] | Postgres (paid server); DuckDB (wrong access pattern); TEXT-address schema (~5× larger) |
| Serving model | **Ship the whole *shipped* `atlas.db` (≈19 MB, raw preimage bytes stripped) as a static asset committed to git → Vercel hobby serves it → browser loads it once into OPFS/in-memory → query locally in-browser (WASM)** | Measured shipped size ≤ 75 MB with ~4× headroom ⇒ fully local after first load, SPK-002's ≪1 ms applies directly, **no per-hop RTT, no backend** [E1 — SPK-003 §3f, ADR-08/10] | Range-requested SQLite (now the >75 MB **static fallback**); **any hosted API/serverless (owner: no backend)** |
| Deployment | **Fully static: `public/atlas.db` committed to the git repo, deployed to Vercel hobby tier, no serverless functions** (owner directive) | ~19 MB fits git (<50 MB warn) & Vercel static serving; zero backend to operate [ADR-10] | Serverless/API backend; external DB host; Git LFS (kept as an escape hatch if rebuilds get frequent) |
| Frontend | **React + React Flow + Zustand + Tailwind (Vite)** | Reused from gov-graph on evidence [E3] | D3/Cytoscape; Redux/Context [E3] |
| Backfill runtime | **Offline batch** (local/CI) → produces a **static `atlas.db` snapshot committed to git** (may **hydrate from the SPK-003 seed** instead of re-downloading; rebuilt manually/occasionally) | Preserves $0; reuses already-downloaded data; no dynamic DB to maintain | Always-on indexer service; dynamic/frequently-updated DB |

## 4. Architecture in one breath

**Build time (offline, $0):** the Subsquid backfill reads the SQD archives + RPC and the Decode/Adapter maps decoded JSON → rows with an **era-conditional** rule (Asset Hub: votes/delegations from events; **relay: votes from `vote` calls** — the pre-migration runtime emits no `Voted` event — and delegation track from the `delegate` call, since the relay `Delegated` event is 2-arg), **interning every address** to an integer id, decoding preimages (incl. **treasury `spendLocal` → beneficiary+amount**, unwrapping `whitelist`/`batch` wrappers), and computing `effective_weight = balance × conviction`. The Builder emits a versioned **shipped `atlas.db`** (≈19 MB — raw preimage bytes dropped from the ~42 MB build DB) + manifest. **Query time (Vercel hobby static host, $0, no backend):** the ≈19 MB `atlas.db` is committed to the repo (`public/`) and served by Vercel as a static asset; the SPA's single **Data Access Layer** opens the whole SQLite in the browser (OPFS/in-memory), resolves internal ids to **SS58 addresses** at its boundary, and exposes only **single-hop `neighbours(nodeId)`** + cluster aggregates; React Flow renders one center + neighbours; a referendum's votes (deduped to one per voter) render as the **top-9 by influence (`effective_weight`) + one aggregate "Minority" node** for the remainder (the busiest real referendum, ref 453, has 751 distinct voters — top-9 hold 36.5% of weight, the other 742 collapse to a "+742" node), with a paginated searchable sidebar; clicking any node calls `entityDetail`. A breadcrumb records the journey and **auto-collapses loops**. Key trade-offs: single-hop-only storage (no graph DB); per-track delegation edges; events-vs-calls chosen per era; **node ids stay address-canonical** (interned integer ids are internal-only and not rebuild-stable); the **SQD key is build-time only, never shipped** (CI secret-scan).

## 5. Contracts & build sequence

**Frozen contracts (CON-001/002 v0.3.1):** CON-001 (optimized SQLite schema + typed edge model + DAL API + node-id scheme + `UNIQUE(voter_id,poll)` + build-only `preimage.bytes` — machine-validated at full scale), CON-002 (era-conditional decode mapping + interning + treasury unwrap + vote upsert-to-latest + strip-bytes publish step — grounded on captured payloads). **AS v0.5.1 / SPEC v0.4.1** pin the fully-static Vercel-hobby + DB-in-git deployment (ADR-10). **Build order (SPEC-001):** **slice 0 = DISCHARGED** (SPK-003: relay decode proven, MVP = full history) → (1) backfill pipeline (optionally hydrate from the SPK-003 seed) → (2) DAL in-browser → (3) walking skeleton → (4) **deploy to Vercel hobby early** (static SPA + committed `atlas.db`) → (5) traversal + breadcrumb/loop-collapse → (6) top-9 whale + Minority cluster + sidebar → (7) recursive account + per-track delegation → (8) preimage inspector + search + deep-link → (9) accessibility. Every slice ends green on a named deterministic check; all 14 QA scenarios have executable checks against the **real published `atlas.db`**.

## 6. Open risks & residual assumptions (all with owners/paths, none blocking)

- **RESOLVED this round:** A-06 (relay decode + MVP history — full history), A-16 (real **measured** shipped DB **≈19 MB** / build ~42 MB), A-17 (latency — local after load, 0.15–1.7 ms measured), UNK-03 (Split/SplitAbstain proven [E1]). Folded into CON-001/002/AS/SPEC at **v0.3.1** (evidence DIS-001 + DIS-002, which superseded the earlier ~32 MB *projection* with the real measurement and added two contract rules: vote de-dup + bytes-strip).
- **People-chain identity backfill:** display names/judgement come from the People archive (proven in SPK-001); it enriches `account` rows and is a slice-1/8 step, not re-run in SPK-003.
- **Preimage content availability < 100%:** Legacy (Gov1) and never-noted/cleared Lookup proposals have no decodable bytes — handled by the `preimage.available` flag + "unavailable" degradation (real availability rate reported in SPK-003 §3g).
- **Browser-path confirmation (QA-01/QA-03):** SPK-003 measured ≪1 ms on the full-scale optimized DB natively; the in-browser WASM load + query is confirmed in slice 2 (the DB is local, so no network hot path remains).

## 7. Start implementation

The project is **implementation-ready**: all knowledge-phase artifacts frozen (CON-001/002 v0.3.1, AS v0.5.1, SPEC v0.4.1, machine-validated against real full-scale data), every quality-attribute scenario backed by an executable check, and **no pre-implementation spike remaining**. The deployment is fully static (Vercel hobby, `atlas.db` committed to git, no backend). A real hydration `atlas.db` seed is preserved so slice 1 need not re-download. Implementation is a separate, user-initiated phase (ideally a fresh session on a cost-efficient model). To begin:

```
/start-implementation opengov-atlas
```
First action there is **slice 1 (backfill pipeline)** against CON-001/CON-002 — building (or hydrating) the real `atlas.db`, then the in-browser DAL.

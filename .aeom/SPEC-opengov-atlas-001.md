---
artifact_id: "SPEC-opengov-atlas-001"
artifact_type: specification
project: "opengov-atlas"
version: 0.4.1
state: frozen
risk_tier: medium
depends_on: ["AS-opengov-atlas-001", "CON-opengov-atlas-001", "CON-opengov-atlas-002"]
supersedes: null
owners: ["Parikshit"]
---

# Specification — Implementation Strategy

> Realizes AS §8. Sequences the build into verifiable slices, each ending green on named deterministic checks. Implementation is a **separate, user-initiated phase** (never begun here).

## 1. Build order (capability slices → Definition of Done)

| # | Slice | Capabilities | Contracts | Slice DoD (deterministic) |
|---|---|---|---|---|
| 0 | **SPK-003 — DISCHARGED** ✅ relay decode proven; **MVP = full history** (all 1,919 referenda, **~19 MB shipped**) | — | — | **Done** — relay+AH decoded, full-history `atlas.db` built & **measured** (shipped ≈19 MB, DIS-002), graph closure + dedup + whale verified (SPK-003). No blocker remains before slice 1 |
| 1 | **Backfill pipeline** (indexer + decode + schema build) | CAP-008 | CON-001, CON-002 | Real `atlas.db` built from a bounded backfill; `PRAGMA integrity_check=ok`; decode fixture tests green (QA-02 partial); manifest emitted |
| 2 | **DAL** (WASM SQLite range-request read path) | — | CON-001 | In-browser `neighbours()` round-trips against the published DB; QA-01 browser perf-mark ≤ target |
| 3 | **Walking skeleton**: referenda list + split layout + canvas centering a Referendum + immediate neighbours | CAP-001, 002, 003 | CON-001, CON-004(model), CON-006(store) | Playwright: list→select→canvas shows center + neighbours vs fixture |
| 4 | **Deploy skeleton to Vercel hobby** (static SPA + `public/atlas.db` committed to git; no serverless) | CAP-016 | — | QA-13 post-deploy smoke 200s (app + `atlas.db` asset) + a real traversal on the committed DB; **no serverless function deployed**; QA-10 secret-scan green; QA-03 committed-DB ≤ budget |
| 5 | **Focused traversal + re-center + breadcrumb/Back + already-visited** | CAP-003, 007 | CON-004 | QA-08 node-id stability + already-visited over a cyclic fixture |
| 6 | **Whale + Minority cluster + sidebar + value encoding** | CAP-005, 006 | CON-001(§4), CON-005 | QA-04 top-N + aggregate = SQL truth; QA-09 encoding-from-fields |
| 7 | **Recursive account expansion + per-track delegation** | CAP-004, 012 | CON-001, CON-004 | QA-05 per-track cardinality; multi-path→same canonical node |
| 8 | **Preimage inspector + search + deep-link** | CAP-009, 011, 010 | CON-002, CON-005 | QA-07 decode fixture; QA-06 identity join; search-by-display |
| 9 | **Accessibility hardening** (continuous + dedicated pass) | — | — | QA-12 axe-core 0 critical/serious |

## 2. Verification plan (QA → executable check → tool)

| QA | Check | Tool |
|---|---|---|
| QA-01 | Browser single-hop latency perf-mark ≤ target | Playwright + Performance API over the real WASM DAL |
| QA-02 | Backfill resume: checkpoint→kill→resume, row-count reconcile, no dup edges; **a re-vote upserts (no duplicate active vote per (voter,poll))** | Node integration test on `node:sqlite` build (`ux_vote_voter_poll`) |
| QA-03 | **Shipped** DB bytes ≤ 75 MB (measured ≈19 MB, ADR-08) **and no non-null `preimage.bytes`** (build-only, stripped) | build/publish step + CI assertion |
| QA-04 | Whale **top-9** + aggregate == SQL ground truth on **deduped-to-latest** votes (real ref 453 = 751 voters → top-9 36.5% + "+742"); all 3 vote variants | Vitest over the real captured fixtures (`CON-002_vote_variant_validation.json`) + ref-453 fixture DB |
| QA-05 | Per-(account,track) delegation cardinality | Vitest over multi-track fixture |
| QA-06 | Identity join + graceful no-identity fallback | Vitest contract test |
| QA-07 | Preimage `bytes`→pallet·method decode; **treasury spend → beneficiary+amount** (incl. whitelist/batch nested unwrap) | Vitest over real captured `relay_preimage_treasury_decoded.json` |
| QA-08 | Node-id stability + already-visited over cyclic fixture | Vitest |
| QA-09 | Vote encoding maps from row fields | Component test (Testing Library) |
| QA-10 | No SQD key/token in `dist/` | CI secret-scan (grep/gitleaks) |
| QA-11 | Component-boundary + build-time-not-in-SPA imports | dependency-cruiser in CI |
| QA-12 | 0 critical/serious a11y violations | @axe-core/playwright |
| QA-13 | **Vercel hobby** static deploy 200 (app + committed `atlas.db` asset) + live traversal; **no serverless function present** | CI/CD + Playwright post-deploy |
| QA-14 | No raw HTML from upstream text | Vitest hostile-markup fixture |

Fixtures are the **real captured SPK-001 payloads** (`.aeom/spikes/captured-payloads/`) — tests run against recorded real data, and each in-scope CAP must additionally be demonstrated once against the **real published `atlas.db`** before `verified` (never mocks only; per standing memory guidance on real round-trips).

## 3. Toolchain (from FM, [E3]-reused where noted)

TypeScript · Vite · React · React Flow · Zustand · Tailwind (frontend) [E3] · `@subsquid/substrate-processor` + `@polkadot/api` (build-time backfill/decode) [E1] · SQLite: `node:sqlite` (build) + WASM SQLite w/ HTTP range-requests (browser) [E1] · Vitest + Playwright + @axe-core + dependency-cruiser (verification) [E3]. Build-time env: `SQD_API_KEY` (never `VITE_`-prefixed, never shipped — QA-10).

## 4. Escalation & gates

Per governance model-tiering: a logged Discovery, a new Trade-off Record, any high-tier change, or the same check failing 3× returns to the knowledge-phase model class or the human owner. **SPK-003 is discharged (DIS-001 logged and folded into CON-001/002/AS); UNK-03 is closed [E1].** No pre-implementation spike remains — slice 1 (backfill) may begin directly, optionally hydrating from the SPK-003 `atlas.db` seed rather than re-downloading.

## 5. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | product | approve | Every in-scope CAP maps to a slice with a user-observable DoD; walking-skeleton-then-deploy-early order retires integration risk first. |
| 2026-07-07 | architecture | approve | Slice order respects contract dependencies; DAL isolation preserved; SPK-003 correctly gates history depth before backfill commits. |
| 2026-07-07 | quality | approve | §2 maps all 14 QA scenarios to concrete tools; fixtures are real captured payloads and each CAP is demonstrated against the real `atlas.db` before verified. |
| 2026-07-07 | performance | approve | QA-01/03 browser + size benchmarks are sequenced early (slices 2/4), converting SPK-002's native evidence to deployed-path verification. |
| 2026-07-07 | security | approve | QA-10 secret-scan and build-time-only key handling are in the DoD of the deploy slice. |
| 2026-07-07 | ux | approve | Accessibility is continuous + a dedicated slice-9 pass (QA-12); focused-traversal/whale-cluster interactions map to slices 5/6. |
| 2026-07-07 | product + quality (v0.2.x change, evidence DIS-001/SPK-003) | approve | Slice 0 (SPK-003) discharged — relay decode proven, MVP scoped to full history (~32 MB), so slice 1 backfill starts directly and may hydrate from the SPK-003 seed. QA-03 budget concretized (≤75 MB); QA-04/QA-07 now bind real captured fixtures (all vote variants, treasury preimage) instead of spec. |
| 2026-07-08 | product + quality (v0.3.0 change, evidence DIS-002/SPK-003) | approve | Numbers corrected to the real **measured** build: shipped DB **≈19 MB** (QA-03, + a no-`preimage.bytes` CI assertion since raw bytes are build-only). QA-04 binds real **ref-453** ground truth on **deduped-to-latest** votes (751 voters → top-9 36.5% + "+742"); QA-02 now also asserts a re-vote **upserts** with no duplicate active vote (`ux_vote_voter_poll`). Slice order and DoDs unchanged. |
| 2026-07-08 | product + architecture (v0.4.0 change, owner directive) | approve | Deploy target pinned to **Vercel hobby with `atlas.db` committed to git** (AS ADR-10): slice 4 + QA-13 now assert the committed DB asset 200s and **no serverless function is deployed** (fully static, no backend). No slice reordering; retires deploy/$0 risk exactly as before, now against a concrete substrate. |

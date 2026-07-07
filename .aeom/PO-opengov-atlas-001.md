---
artifact_id: "PO-opengov-atlas-001"
artifact_type: product_overview
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: high
depends_on: []
supersedes: null
owners: ["Parikshit"]
open_questions_remaining: 0
---

# Product Overview — OpenGov Atlas

> **MASTER MOLD — INSTRUCTIONS TO THE REASONING ENGINE**
> This document describes the *problem and product*, never the *technical solution*. Every factual claim carries an evidence tag. This overview is mapped from the owner-supplied `opengov-atlas/Project-Overview.md` [E2 — primary source, product owner's specification] without inventing product content; genuine gaps are recorded in §9. Domain facts about Polkadot OpenGov are tagged `[E2]` (real governance design) or `[E3]` (prior gov-graph institutional knowledge, cited by artifact ID). The prior project **gov-graph** built the same domain against live REST APIs; its frozen artifacts and 16 implementation Discoveries are directly-relevant `[E3]` evidence.

## Evidence Classes

`[E1]` measured (benchmark, telemetry, spike) · `[E2]` primary source (user research, contract, regulation, vendor doc, owner spec) · `[E3]` prior-project institutional knowledge (cite artifact ID) · `[E4]` expert judgement (cite who) · `[A]` assumption — must appear in §9 with a resolution plan.

---

## 1. Problem Statement

Polkadot OpenGov is one of the most expressive on-chain governance systems in existence — conviction-weighted voting, per-track delegation, multiple decision tracks with distinct approval/support curves, preimage-based proposals, treasury spends — but existing explorers present it as flat lists of referenda and raw hex metadata, obscuring the fact that governance is fundamentally **relational** [E2 — source §2]. A referendum only makes sense in terms of who proposed it, on what track, who voted, how heavily, and who delegated their power to whom [E2 — source §2].

- **Who has this problem:** governance participants/token holders, delegates & delegators, ecosystem developers & analysts, and researchers/journalists studying Polkadot governance [E2 — source §4].
- **Cost of the problem today (quantified where possible):** participants cannot easily see how influence flows; developers cannot trace execution/delegation structure; newcomers face a steep cognitive barrier that suppresses participation [E2 — source §2]. A hard usage-cost baseline (e.g. task-time or turnout figures) is not measured — see §9 A-01.
- **Why now:** OpenGov is the live, primary governance system for Polkadot, and its complexity is growing (more tracks, more delegation), widening the legibility gap [E2 — source §2]. Governance state has also recently migrated on-chain (relay chain → Asset Hub, 2025-11-04), changing where this data lives [E3 — DIS-gov-graph-013].

## 2. Target Users & Stakeholders

| User / Stakeholder | Role | Primary Need | Evidence |
|---|---|---|---|
| Governance participants & token holders | Vote / delegate | Understand a referendum's real support structure (who drives it, whales, delegation concentration) before voting | [E2 — source §4] |
| Delegates & delegators | Give/receive voting power | See and audit delegation relationships on a per-track basis | [E2 — source §4] |
| Ecosystem developers & analysts | Trace & inspect | Trace an account's full governance footprint; inspect what a proposal actually executes | [E2 — source §4] |
| Researchers & journalists | Study governance | Analyse voting concentration, turnout, and influence over time | [E2 — source §4] |
| Product owner (Parikshit) | Solo builder / accountable owner | Ship an MVP; strong React/frontend, limited Polkadot/Substrate domain depth — relies on the Harness as Polkadot domain expert | [E2 — source §4 domain-authority note] |

## 3. Product Definition

OpenGov Atlas is a relationship-first explorer for Polkadot OpenGov: instead of walls of referenda and disconnected lists, it lets a user *traverse* governance as a graph — starting at a referendum and walking outward one node at a time to its proposal, its track, its votes, the accounts behind those votes, and the delegation relationships that shaped them [E2 — source §1]. Two commitments make it work: **focused traversal** (the canvas shows exactly one center node and its immediate neighbours at a time, with an explicit history to walk back), and a **complete local index** of governance history so every traversal resolves against a local store, not a third-party API in the hot path [E2 — source §1, §3].

## 4. Core Capabilities (What, never How)

| ID | Capability | User Outcome | Priority (MoSCoW) | Evidence of Need |
|---|---|---|---|---|
| CAP-001 | Referenda list (entry point) | User browses a paginated list, searchable and filterable by track & status, sortable by recency/turnout/approval | Must | [E2 — source §6.1, §10] |
| CAP-002 | Split-layout referendum view | Selecting a referendum shrinks the list to ~1/3 (list + detail pane) and opens a ~2/3 graph canvas centred on that Referendum node | Must | [E2 — source §6.2, §10] |
| CAP-003 | Focused traversal / one-hop expansion | Clicking any node promotes it to the new center; only that center's immediate typed neighbours render; the rest collapses | Must | [E2 — source §6.3, §10] |
| CAP-004 | Recursive, identity-stable account/entity expansion | From any Account, fan out across *all* its governance relations (proposed, voted, delegates-to, delegated-by per track, benefits-from); the same entity is one canonical node regardless of path; already-visited neighbours are marked | Must | [E2 — source §6.3, §6.3.1] |
| CAP-005 | Whale nodes + Minority cluster + sidebar | On expanding Votes, top-N voters render as individual nodes; the remainder collapses into one "Minority Voters" cluster with aggregates; clicking it opens a paginated, address/identity-searchable sidebar that re-centers the graph on any chosen voter | Must | [E2 — source §6.4, §10] |
| CAP-006 | Value-based color/size coding of votes | Direction drives hue (Aye/Nay/Split/Abstain); intensity/size encodes effective weight; direct vs delegated votes are visually distinguished | Must | [E2 — source §6.4, §10] |
| CAP-007 | History/breadcrumb + Back navigation | A persistent breadcrumb records the ordered path of centers (loops allowed); Back restores the prior center and neighbours exactly; breadcrumb entries are clickable | Must | [E2 — source §6.5, §10] |
| CAP-008 | Local indexed store via historical backfill | Governance history is indexed once from a decentralized archive into a local store, with checkpoint/resume, so traversal queries resolve locally | Must | [E2 — source §3, §7, §10] |
| CAP-009 | Preimage / proposal inspector | Proposal nodes reveal the decoded call (pallet · method · key args) with a raw developer view; treasury calls reveal beneficiary + amount | Must | [E2 — source §5.1, §6.3, §6.6] |
| CAP-010 | Deep-linkable state | Every center node has a shareable URL that restores that view | Should | [E2 — source §6.6] |
| CAP-011 | Global search (referenda + accounts) | From anywhere, jump straight to any referendum or account (identity-resolved) as a new center | Should | [E2 — source §6.6] |
| CAP-012 | Delegation-centric account view | On an account, see the full inbound delegation tree (who delegates to them, with conviction) and outbound (who they delegate to), per track | Should | [E2 — source §6.6] |
| CAP-013 | Influence / aggregation readouts | On account and cluster nodes: total effective voting power, number of delegators, concentration | Should | [E2 — source §6.6] |
| CAP-014 | Timeline / lifecycle context on referendum | Where a referendum sits in its lifecycle and against its track's approval/support curve | Should | [E2 — source §6.6, §5.1] |
| CAP-015 | "Explain this" concept tooltips | Short plain-language tooltips for OpenGov concepts (conviction, tracks, support vs approval) | Could | [E2 — source §6.6] |
| CAP-016 | Deploy to a free host | The MVP is publicly reachable, deployed within a $0 hosting budget | Must | [E2 — source §10] |

## 5. Explicit Non-Goals

| Non-Goal | Why excluded | Revisit condition |
|---|---|---|
| Governance execution / wallet actions (voting, delegating, signing) | Atlas is a read-only explorer; on-chain writes are out of scope [E2 — source §1/§4 by absence; E3 — PO-gov-graph-001 §5] | If the product later adds a "participate" flow with wallet integration |
| Whole-graph materialization / a "full map" render | The graph is unbounded and cyclic; the focused one-center-at-a-time model is what makes it navigable at all [E2 — source §6.3.1] | Never for the MVP; a bounded overview view could be a future feature |
| Deep transitive delegation pathfinding (arbitrary-depth chains, shortest-influence-path) | Atlas's access pattern is deliberately single-hop; deep multi-hop traversal is what a graph DB is for and Atlas avoids it [E2 — source §8, §10] | If a genuine deep-pathfinding feature is prioritized, revisit storage per §8 |
| Cross-referendum analytics dashboards | Out of MVP scope; Atlas is an explorer, not an analytics suite [E2 — source §10] | Post-MVP analytics milestone |
| Multi-chain support (Kusama and others) | MVP is Polkadot OpenGov only [E2 — source §10] | After Polkadot MVP is proven |
| Live sync of brand-new events at MVP | A periodically-refreshed historical backfill is sufficient for MVP; live sync is a nice-to-have if backfill lands first [E2 — source §7, §10, §11 Q5] | If real-time freshness becomes a validated user need |
| Non-OpenGov governance (Fellowship/collectives tracks) | Scope decision deferred; MVP targets OpenGov referenda [E2 — source §11 Q7] | Explicit scope decision in a later milestone |

## 6. Constraints (Inputs to the Feasibility Matrix)

- **Regulatory / compliance:** N/A — Atlas reads only public, on-chain governance data; no regulated data class applies [E4 — derived; consistent with E3 PO-gov-graph-001 §6].
- **Data residency & privacy:** No PII is collected. On-chain accounts are pseudonymous public keys; on-chain identities are already public. There is no user-account system, login, or authorization boundary [E4 — derived by absence; E3 — AS-gov-graph-001 §6]. See §9 A-02.
- **Scale expectations (data volume):** The index must hold **the full relevant OpenGov history** — every referendum, every individual vote, every delegation, preimages, and resolved identities [E2 — source §7 "store atomically and completely"]. Real magnitudes: on the chain now holding governance state, `referendumCount ≈ 1919` and unfiltered conviction-voting entries ≈ 44,296 at time of the prior project [E3 — DIS-gov-graph-013, measured 2026-07]. Exact total row counts, DB size, and per-runtime-version history depth are a knowledge-phase measurement — see §9 A-03. Concurrent-user scale is low (personal/community explorer) [A — §9 A-04].
- **Latency / availability targets:** Every traversal is a **single-hop, immediate-neighbours** query and must feel instant — single-digit-millisecond local reads [E2 — source §1, §3, §8]. The one-time historical backfill is an offline batch job whose acceptable duration is a knowledge-phase target (§9 A-03). Query-time availability must not depend on any third-party API being up [E2 — source §3].
- **Budget & operating cost ceiling:** Deployment to a **free host** at ~$0 operating cost [E2 — source §10]. This creates a real tension with "a complete local database in the query hot path" that must be resolved in architecture — see §9 A-05 (the single most consequential open question).
- **Team skills & hiring reality:** Solo builder; deep React/TypeScript/frontend expertise; **limited Polkadot/Substrate domain depth** [E2 — source §4]. The Harness carries standing authority to act as the **Polkadot domain expert** and must flag/correct any data-flow or interaction that misunderstands OpenGov, conviction voting, preimages, or delegations, rather than encoding the misconception [E2 — source §4 domain-authority note].
- **Timeline & hard deadlines:** No fixed deadline; "rapid iteration and momentum" is a soft priority [E4 — derived; consistent with E3 PO-gov-graph-001 §6].
- **Integration obligations (systems that must be talked to):**
  1. Governance data must be sourced by **indexing a decentralized Substrate archive into a local store** — an executed, proven indexer package, **not** the SubSquare / Subscan / Polkassembly REST APIs at query time [E2 — owner directive 2026-07-07]. This is a hard boundary, not a preference: the prior project's sustained REST pain (403 auth-gating, User-Agent flakiness, endpoint guessing) is why [E3 — DIS-gov-graph-004, DIS-gov-graph-009, DIS-gov-graph-014].
  2. **Governance state now lives on Polkadot Asset Hub**, not the relay chain, since the Asset Hub migration completed 2025-11-04 — the indexer/archive must target the chain that actually holds Referenda/ConvictionVoting/Preimage storage [E3 — DIS-gov-graph-013].
  3. **Identity** must be resolved from the **People system chain**, since identity migrated off the relay chain [E2 — source §7, §9 checklist item 4].
  4. Feasibility of every external data source is established **by executing real code against real endpoints and capturing real payloads**, never by vendor docs alone [E2 — source §9 evidence principle].

## 7. Success Metrics

| Metric | Baseline | Target | Measurement method (deterministic where possible) |
|---|---|---|---|
| Single-hop traversal read latency (local store) | none | single-digit ms p95 for immediate-neighbours query | Benchmark harness over the populated local store; asserted in CI [E2 — source §10; measurable] |
| Canvas legibility (nodes rendered per view) | none | Exactly one center + its immediate neighbours (whales individual, remainder clustered) at any moment | Automated UI assertion on rendered node set [E2 — source §10] |
| Traversal reachability | none | A user can go from the referenda list to any individual voter's delegation footprint purely by clicking | E2E test walking the path end-to-end [E2 — source §10] |
| Influence legibility | none | Whale vs minority and delegation direction are distinguishable at a glance (encoded, not read) | UI/contract test on color/size/direction encoding [E2 — source §6.4, §10] |
| External-data grounding | none | 100% of external data claims in the build are backed by verified captured sample data, not assumption | Every data contract cites a captured spike payload [E2 — source §10, §9] |
| Backfill completeness & resumability | none | Backfill covers the target history window and resumes cleanly from its last checkpoint | Checkpoint/resume test; row-count reconciliation against chain [E2 — source §7] |

## 8. Risks (Product-level)

| ID | Risk | Likelihood | Impact | Mitigation / Owner |
|---|---|---|---|---|
| R-01 | The chosen indexer cannot download OpenGov data (referenda/votes/delegations/preimages/identity) in a usable shape from the archive for the Asset Hub + People chains | Medium | Critical (blocks the whole data thesis) | **Executed proof-of-feasibility spike is a hard precondition** (source §9); resolve which indexer works before any contract depends on it / Parikshit |
| R-02 | Total volume / DB size / build time make a "complete local index" impractical for a free host | Medium | High | Measure real volumes in the spike; §9 A-03, A-05 drive an architecture decision (bounded window vs full history; how "local" is served) / Parikshit |
| R-03 | Historical decoding breaks across runtime upgrades (Gov1 vs Gov2/OpenGov, pre/post Asset Hub migration) | Medium | High | Scope the history window and decode strategy against captured evidence in FM/architecture; §9 A-06 / Parikshit |
| R-04 | Identity (People chain) coverage/joins insufficient to resolve display names | Medium | Medium | Verify People-chain archive coverage and account-join in the spike; §9 A-07 / Parikshit |
| R-05 | "$0 free host" is incompatible with "complete local DB in the hot path" (e.g. static hosts can't run a server DB; DB-in-browser has size limits) | Medium | High | Architecture must reconcile; candidate shapes named in §9 A-05 / Parikshit |
| R-06 | Novel focused-traversal + whale/cluster interaction is confusing or mis-models OpenGov | Low | Medium | Domain-expert review of every expansion contract against real OpenGov semantics (per §6 authority); prior gov-graph domain corrections reused [E3] / Parikshit |

## 9. Assumptions & Open Questions  ⚠ FREEZE GATE

> No **blocking** questions remain for Product-Overview approval — every item below is a knowledge-phase (Feasibility/Architecture/Spike) resolution with an owner and a path, consistent with the source being a settled overview. `open_questions_remaining: 0`.

| ID | Assumption / Question | Blocking? | Resolution path | Owner | Status |
|---|---|---|---|---|---|
| A-01 | No quantified baseline of the current-tooling cost (task-time, turnout suppression) exists | No | Accept as qualitative for MVP; optional user research post-MVP | Parikshit | Accepted (qualitative) |
| A-02 | Read-only, fully public, no-auth posture (no user accounts anywhere) | No | Confirmed by absence across the source; carried to Architecture §6 | Parikshit | Accepted |
| A-03 | Real governance data volume, DB size, backfill duration, and single-hop latency on real data are unmeasured | No | **Feasibility spike** — capture real volumes/timings against real endpoints (source §9 checklist item 6) | Parikshit | Open → Spike |
| A-04 | Concurrent-user scale is low (personal/community explorer) | No | Architecture default (no server-scaling infra); revisit if usage grows | Parikshit | Accepted (default) |
| A-05 | **How "local, single-digit-ms" reads are served under a $0 free host** — meta-framework with server-side DB reads vs. client-shipped embedded DB vs. prebuilt-DB-as-static-asset | No | **Feasibility Matrix + Architecture** decision, grounded on measured DB size (A-03) | Parikshit | Open → FM/Arch |
| A-06 | History depth for MVP (all of OpenGov from Gov2 genesis vs a bounded recent window) and the decode strategy across runtime upgrades / the Asset Hub migration | No | FM/Architecture, grounded on spike evidence (source §11 Q4, §9 checklist item 1) | Parikshit | Open → FM/Arch |
| A-07 | Identity edge cases: accounts with no identity, sub-identities, stale/parent judgements; People-chain archive coverage and account-join | No | Spike (coverage) + Architecture (display rules) (source §11 Q6, §9 checklist item 4) | Parikshit | Open → Spike/Arch |
| A-08 | "Value" for color coding: conviction-weighted effective power (recommended) vs raw balance vs hybrid; exact palette for Aye/Nay/Split/Abstain and direct vs delegated | No | Architecture / design detail; conviction-weighted is the recommended default (reflects real influence) (source §6.4, §11 Q1) | Parikshit | Open → Arch |
| A-09 | Whale threshold: fixed top-N vs percentage-of-turnout vs user-adjustable | No | Architecture / design detail (source §11 Q2) | Parikshit | Open → Arch |
| A-10 | MVP live-sync need (periodic backfill vs live WebSocket sync) | No | Deferred per §5 non-goal; revisit if freshness is a validated need (source §11 Q5) | Parikshit | Deferred |
| A-11 | Fellowship/collectives tracks in or out of MVP scope | No | Scope decision in a later milestone; MVP is OpenGov referenda (source §11 Q7) | Parikshit | Deferred |
| A-12 | Accessibility posture is unstated in the source (a graph-canvas explorer has real keyboard/screen-reader/contrast challenges) | No | Carry an accessibility baseline into Architecture §5 as a verifiable quality-attribute scenario, mirroring the prior project [E3 — AS-gov-graph-001 §5 QA-04] | Parikshit | Open → Arch (raised by UX review ISS-PO-U1) |

## 10. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | product | approve | No blocking issues. Confirmed: all source §§1–11 mapped without invention; capabilities carry evidence of need; ≥3 non-goals (7 present); constraints exhaustive; success metrics deterministic-where-possible. Non-blocking Suggestion (SUG-PO-P1): §6 names data-source *systems* (Asset Hub, People chain, "an indexer, not REST") — this is a legitimate integration-obligation constraint (mirrors frozen E3 PO-gov-graph-001 §6 naming SubSquare/Subscan), not a stack leak; the specific indexer package is correctly deferred to the Feasibility Matrix. |
| 2026-07-07 | ux | approve | ISS-PO-U1 (non-blocking, resolved by logging): source states no accessibility posture; a focused-traversal graph canvas has real keyboard/screen-reader/contrast challenges. Logged as §9 A-12 to be operationalized as a verifiable Architecture §5 quality-attribute scenario (mirrors E3 AS-gov-graph-001 QA-04). Interaction-consistency check: the one-hop expansion contract, whale/cluster, breadcrumb/back, and already-visited marking are internally consistent across CAP-002–007. |
| 2026-07-07 | harness (full-profile gap-analysis, per project_profiles.json#full) | no blocking gap | Scheduled discover pass over the mapped PO: every source capability (§6/§10) traces to a CAP row; every source constraint (§6–§9) traces to a §6 constraint or §9 assumption; the source's one hard gate (executed proof-of-feasibility, §9 evidence principle) is carried as R-01 + A-03 and routed to a spike. No unmapped source content found. |

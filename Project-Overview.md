# Project Overview: OpenGov Atlas

> **Status:** Vision / product overview for AEOM knowledge phase.
> **Nature of this document:** It defines *what* we are building and *why*, the domain model, and the interaction design. Technology named here is a **candidate to be verified during AEOM discovery**, not a committed decision. **No implementation, and no fetching, begins until the executed feasibility verification described in Section 9 is complete.**
>
> **Evidence principle (governs the whole project).** Feasibility is not established by reading documentation — it is established by *running code*. During the knowledge phase, candidate npm packages that download the archive (e.g. the Subsquid processor / archive-download tooling) **must be actually installed and executed against the real endpoints**, and must be shown to (a) download the governance archive and (b) yield the exact data we need in a captured, inspectable shape. Every contract, schema, and spec that follows is **absolute and grounded on that proven, executed evidence** — real sample payloads and real runs, never assumption or vendor claims alone. If a candidate package cannot be proven to work end to end, it is rejected and an alternative is proven before any spec depends on it.

---

## 1. Summary

OpenGov Atlas is a relationship-first explorer for Polkadot OpenGov. Instead of the tabular block-explorer paradigm (walls of referenda, hex hashes, disconnected lists), Atlas lets a user *traverse* governance as a graph: start at a referendum and walk outward one node at a time to its proposal, its tracks, its individual votes, the accounts behind those votes, and the delegation relationships that shaped them.

The core UX principle is **focused traversal**: the canvas never renders the whole graph. It shows exactly one center node and its immediate children. Clicking a child promotes it to the new center, the previous view collapses away, and a breadcrumb/history panel records the path so the user can walk back. This keeps the interface legible no matter how large the underlying dataset is.

The core data principle is **chain-first and local**: governance history is indexed once from decentralized archives into a local relational store, so every traversal query resolves against a local database in single-digit milliseconds with no third-party API in the hot path.

---

## 2. The Problem

Polkadot OpenGov is one of the most expressive on-chain governance systems in existence — conviction-weighted voting, per-track delegation, multiple decision tracks with distinct approval/support curves, preimage-based proposals, treasury spends — but it is visually impenetrable. Existing explorers and dashboards present it as flat lists and raw metadata. This obscures the thing that actually matters about governance: it is *relational*. A referendum only makes sense in terms of who proposed it, on what track, who voted, how heavily, and who delegated their power to whom.

The cost of this is real: participants can't easily see how influence flows, developers can't trace execution and delegation structure, and newcomers face a steep cognitive barrier that suppresses participation.

## 3. The Solution

Atlas reframes governance data as a navigable graph and gives the user a controlled, zero-clutter way to explore it. Two design commitments make this work:

1. **One center node at a time.** The graph is a lens, not a map. We never ask the user to parse a hairball. Complexity is revealed on demand, node by node, with an explicit history they can retrace.
2. **A complete local index.** Because the entire relevant history lives in a local database, expansion feels instantaneous and the app is not hostage to rate limits, downtime, or schema drift of live public APIs at query time.

## 4. Target Users

- **Governance participants & token holders** who want to understand a referendum's real support structure — who's driving it, who the whales are, how delegation concentrates power — before they vote or delegate.
- **Delegates and delegators** who want to see and audit delegation relationships on a per-track basis.
- **Ecosystem developers & analysts** who want to trace an account's full governance footprint, or inspect what a proposal actually executes.
- **Researchers & journalists** studying voting concentration, turnout, and influence over time.

> **Domain-authority note (carried over from prior project intent):** the product owner is strong on React/frontend but has limited Polkadot/Substrate domain depth. The AEOM harness should act as the **Polkadot domain expert** — if a proposed data flow or interaction misunderstands how OpenGov, conviction voting, preimages, or delegations actually work, it should flag the contradiction, explain the correct paradigm, and recommend the better path rather than implementing the misconception.

---

## 5. Domain Model (what the nodes and edges actually are)

This section fixes vocabulary so the interaction design below is precise. Terms map to real OpenGov concepts; exact availability/shape from any data source is a Section 9 verification item.

### 5.1 Core entities

| Entity | What it is | Key attributes |
|---|---|---|
| **Referendum** | A single OpenGov referendum (`referenda` pallet). | Index, track, status (Submitted → Deciding → Confirming → Approved/Rejected/TimedOut/Cancelled/Killed), submitted/decision/confirm timestamps, tally (ayes, nays, support), deposits. |
| **Track / Origin** | The decision track a referendum runs on (e.g. Root, Treasurer, Small/Big Spender, Whitelisted Caller, etc.). | Track ID/name, decision period, confirm period, approval curve, support curve, decision deposit. |
| **Proposal (Preimage)** | The actual call the referendum enacts, stored as a preimage. This is the "what does it *do*" of the referendum. | Preimage hash, decoded call (pallet + method + args), length, deposit, whether the preimage is available. |
| **Account** | An on-chain account (SS58 address) resolved to a human-readable **identity** where one exists. | Address, display name, identity judgement, sub-identity, roles it plays (proposer, voter, delegate, delegator, beneficiary). |
| **Vote** | One account's vote on one referendum via the `ConvictionVoting` pallet. | Direction (Aye / Nay / Split / SplitAbstain), conviction (0.1×–6×), locked balance, **effective vote weight = balance × conviction**, whether it is a direct vote or received via delegation. |
| **Delegation** | An account delegating its conviction voting power to a delegate **on a specific track**. | Delegator, delegate, track, conviction, balance. Direction matters. |
| **(Optional) Treasury spend / Beneficiary** | For treasury-track referenda, the requested amount and the beneficiary account. | Amount, asset, beneficiary. |

### 5.2 Core relationships (edges)

- Referendum **runs on** a Track.
- Referendum **enacts** a Proposal (preimage/call).
- Referendum **submitted by** an Account (the proposer); an Account **placed the decision deposit** (may differ).
- Referendum **received** many Votes; each Vote is **cast by** an Account.
- Account **delegates to** Account, per Track (and inversely, an Account **receives delegations from** many accounts on a track).
- Treasury referendum **pays** a Beneficiary account.

> **Domain correction to fold in (important):** in the original sketch, clicking *Proposal* would spawn "the member who proposed it and members who delegate to that member for this track." Two things to get right:
> 1. The "proposal" itself is a **preimage/call** — its natural children are the *decoded call* (pallet, method, arguments) and, for treasury calls, the **beneficiary**. The **proposer is an attribute of the referendum**, not of the preimage. Atlas should show the proposer as a child of the *referendum*, and the decoded call as the child of the *proposal*.
> 2. **Delegation attaches to voting power, not to proposing.** "Who delegates to this account on this track" is meaningful when the account is a **voter/delegate**, not because they proposed. So the "delegators fan out" behavior belongs on **vote/account** nodes. We keep the exact interaction the user wants — it just hangs off the correct entity.

---

## 6. Interaction Design (focused traversal)

### 6.1 Entry: the referenda list

The app opens as a **paginated list of referenda** (searchable and filterable by track and status; sortable by recency, turnout, or approval). This is the one place a conventional list is the right tool.

### 6.2 Selecting a referendum: the split

Clicking a referendum triggers the signature layout shift:

- The referenda region **shrinks to ~1/3 of the screen** and itself splits into two stacked panes: the **referenda list** (top) and a **referendum detail** pane (bottom) showing that referendum's decoded metadata — track, status, tally, deposits, timeline, decoded call summary.
- The remaining **~2/3 becomes the graph canvas**, which renders a single **Referendum node** as the center.

### 6.3 Expanding a node (the one rule)

Every expansion follows the same contract: **the clicked node becomes the new center, the rest of the previous view collapses, and only that center's immediate *related* nodes render.** Crucially, "related" is not a fixed parent→child direction — it is *any* typed relation the entity participates in. The graph is a **general, many-to-many, potentially cyclic graph**, not a tree (see 6.3.1). Concretely, a center reveals its neighbors across all relation types that apply:

- **Referendum node** → related: its **Proposal (preimage)**, **Track**, **Proposer (account)**, and its **Votes**. To avoid clutter, Votes are summarized (see 6.4).
- **Proposal node** → related: the **decoded call** (pallet · method · key arguments), for treasury calls the **Beneficiary account** and amount, and the **Referendum(a)** that enact it.
- **Track node** → related: the track's parameters (decision/confirm periods, approval/support curves), and the **other referenda on the same track**.
- **Votes** → expands into **one node per vote**, each an account carrying its **effective weight** (balance × conviction) and direction. See clustering in 6.4.
- **Account node** (whether reached as a voter, proposer, delegate, delegatee, or beneficiary) → related, across *all* of its governance relationships: **referenda it proposed**, **referenda it voted on** (with its vote), the accounts who **delegate to it** and the accounts **it delegates to** (per track), and treasury spends it benefits from. An account is the same node no matter how you arrive at it, and it exposes every relation it has — so from a proposer you can fan out to their other referenda, from those to *their* voters, from a voter to *their* delegates, and onward without limit. This is the recursive heart of the explorer.

### 6.3.1 The graph is general and cyclic (not a tree)

Traversal centers one node at a time, but the underlying structure is a **general graph**: any node can relate to any other node whenever a real relation exists between them, and paths can loop back on themselves. Examples of the loops this creates:

- A **referendum → its proposer → other referenda that proposer submitted → their voters → a voter who also voted on the original referendum** — back to where we started.
- A **delegate → their delegators → a delegator who is themselves a delegate for someone else**, and so on, forming delegation cycles.
- Two accounts that **each voted on the same set of referenda**, reachable from one another through those shared referenda.

Two consequences the design must honor:

1. **Nodes are identity-stable, not path-stable.** An account (or referendum, or proposal) is one canonical node regardless of how many different paths lead to it. Re-centering on it always shows the same complete set of relations. Atlas should visually signal when a revealed neighbor is a node already seen earlier in the current journey ("already visited") so the user recognizes a loop rather than thinking it's a duplicate.
2. **The graph is unbounded and must never be materialized whole.** Precisely because relations are many-to-many and cyclic, there is no "full render" that is safe — the focused, one-center-at-a-time model is what makes an unbounded cyclic graph navigable at all. Expansion is always a **single hop from the current center**; cycles are handled naturally because we never traverse transitively in one shot, we only ever reveal immediate neighbors and let the user choose the next hop.

### 6.4 Handling scale: whales, minority cluster, and the sidebar

A popular referendum can have thousands of voters — far too many to render as individual nodes. Atlas handles this with the **whale + cluster** pattern:

- On expanding Votes, render the **top-N voters by effective weight** as individual nodes.
- Collapse **all remaining voters into a single "Minority Voters" cluster node** that also shows an aggregate (count, total weight, aye/nay split).
- Clicking the cluster opens a **sliding sidebar** with the full, **paginated** list of the remaining voters, including a **search box** that matches by address *or* human-readable identity. Clicking any voter there **closes the sidebar and re-centers the graph on that account** — the same deep re-centering as any other node.

Vote nodes and cluster aggregates are **color-coded by value**: direction drives hue (Aye vs Nay vs Abstain), and intensity/size encodes effective weight so whales are visible at a glance. Direct vs delegated votes are visually distinguished. Exact palette and the "value" encoding (raw balance vs conviction-weighted) are a design detail to settle in the knowledge phase; conviction-weighted is the recommended default because it reflects actual influence.

### 6.5 Navigation: back button and history panel

Because traversal is destructive-by-design (old views collapse) and the graph is cyclic, navigation state is first-class:

- A persistent **history/breadcrumb panel** records the exact *path of centers* taken (Referendum #42 → Votes → Account "Alice" → Referendum #77 she proposed → …). Because the graph loops, the same node can legitimately appear more than once in this path; the history is an ordered journey, not a set.
- A **Back button** pops the stack and restores the prior center and its neighbors exactly.
- Breadcrumb entries are clickable to jump back multiple steps. Optionally support forward navigation and a "pin" to keep a node reachable.
- When the current center reveals a neighbor that already appears earlier in the journey, mark it as **already visited** so loops are legible rather than confusing.

### 6.6 Interactions worth folding in (enhancements)

These extend the user's described flow and are treated as in-scope for the vision (final prioritization happens in AEOM planning):

- **Global search** across referenda *and* accounts from anywhere, resolving identities — jump straight to any account or referendum as a new center.
- **Delegation-centric view** on an account: see the full inbound delegation tree (who delegates to them, with conviction) and outbound (who they delegate to), per track — this is one of the most under-served views in existing tools.
- **Influence/aggregation readouts** on account and cluster nodes: total effective voting power, number of delegators, concentration.
- **Timeline / status context** on a referendum node: where it sits in its lifecycle and against its track's approval/support curve.
- **Preimage inspector**: human-readable decode of the enacted call, with a raw view for developers (the "developer mode" from prior intent — surface the exact pallet and call).
- **Deep-linkable state**: every center node has a URL so a specific view can be shared.
- **"Explain this" affordances**: short, plain-language tooltips for OpenGov concepts (conviction, tracks, support vs approval) to lower the newcomer barrier.

---

## 7. Data & Storage Approach (chain-first, local)

The pipeline is conceptually three stages; the concrete tools are candidates for Section 9 verification.

1. **Index once, from archives.** A background indexer batch-downloads historical governance data from a decentralized archive/indexer (Subsquid archives are the leading candidate: a Polkadot network archive for governance, and a People-chain archive for identity, since identity has migrated off the relay chain to the People system chain). It decodes governance events and writes them to a local database. After the historical backfill, the indexer transitions to a live source (public RPC WebSocket) to stay current.
2. **Store atomically and completely.** No data is discarded or pre-aggregated at the storage layer: every individual vote, delegation, and referendum is recorded as it happened. Human-readable identities are resolved and stored alongside accounts. A compactness technique in the sketch — mapping 48-char SS58 addresses to integer surrogate keys — is a reasonable optimization and stays a candidate.
3. **Serve immediate neighbors only.** Because the UI is always centered on one node, the read layer only ever fetches the direct neighbors of the focused entity (across all its relation types) plus aggregates for clustering — a shallow, single-hop query, even though the overall graph is many-to-many and cyclic. It computes the top-N whales and one aggregate payload for the graph, and serves the paginated remainder to the sidebar separately.

**Checkpointing/resumability:** the indexer records the last synced block so it can pause and resume, and so live sync picks up cleanly after backfill.

---

## 8. Feasibility: do we need a graph database? (direct answer)

**No — and the cyclic, many-to-many nature of the graph does not change this.** The question the user raised ("can this be handled without a graph layer efficiently?") has a clear answer given the interaction model, and it holds even now that we've established the graph is general and can loop.

The key distinction: a graph *being* cyclic and many-to-many is a property of the **data**, but what forces you toward a graph database is the **query pattern**, not the data shape. Graph databases (Neo4j and friends) earn their keep on **deep, multi-hop, variable-length traversals** ("find all paths of length ≤ 6 between A and B", "detect cycles across the whole graph"). Atlas deliberately never runs those. Its access pattern is always **"give me the immediate neighbors of exactly one node,"** i.e. a single-hop lookup — regardless of how densely connected or cyclic the overall graph is. A relational schema expresses this graph cleanly: entities are tables, relationships (votes, delegations, proposer-of, enacts, benefits) are rows in join tables with indexes on both endpoints, so "neighbors of node X" is an indexed lookup in either direction. Cycles are irrelevant to a single-hop query because it never follows a chain — the user follows the chain, one deliberate hop at a time, and each hop is its own fast query.

So the "graph" in OpenGov Atlas is a **rendering and interaction concept, not a storage concept.** The storage layer can be a well-indexed embedded relational database with typed, bidirectional edge tables; the graph structure — cycles and all — is reconstructed at the edges of the app, on demand, one center at a time. This keeps infrastructure near-zero (a single local database file, no separate DB server to run) and keeps queries trivially fast.

**Where this could change (verify in discovery):** if a future feature genuinely needs deep pathfinding — e.g. "trace transitive delegation chains of arbitrary depth" or "shortest influence path between two accounts" — that specific feature might benefit from graph-native queries or a recursive query capability. That is a reason to keep the option open, not to adopt a graph DB now. Recursive relational queries can often cover moderate cases without new infrastructure.

---

## 9. Technology Candidates — **to verify before any build**

Everything here is a hypothesis to be confirmed in the AEOM knowledge/discovery phase. The hard gate the user set: **no work begins until we have *executed* the candidate archive-download packages and proven, with captured real data, that each source exposes the data we need in a confirmed shape.** Verification is a first-class deliverable of discovery, and it is **executed, not read**: reading vendor docs is a starting point, but the feasibility claim only holds once real code has run against real endpoints and produced inspectable output. Contracts and schemas downstream are built *from* those captured payloads.

**Executed proof-of-feasibility (must run before any build):** the planning phase stands up a throwaway spike that actually installs the candidate npm archive-download package(s), points them at the real Polkadot (and People-chain) archive endpoints, and demonstrates a working download of governance data end to end. The spike must capture concrete sample payloads for referenda, votes, delegations, preimages, and identities, and measure real volumes and timings. Success looks like: "we ran package X at version Y against endpoint Z, downloaded N blocks/records, and here are the exact captured shapes for each entity." Anything that cannot be shown this way is not treated as feasible.

**Candidate stack (illustrative, not committed):**

- **Indexer / ETL:** a Substrate indexing framework (Subsquid `substrate-processor` is the leading candidate) decoding governance and conviction-voting events; an embedded database driver for writes.
- **Local store:** an embedded relational database (SQLite via a fast driver is the leading candidate) with indexes tuned for single-hop child lookups; option to revisit if a deep-traversal feature emerges.
- **App framework:** a single cohesive codebase. Two candidate shapes to weigh in architecture: (a) a meta-framework (Next.js) whose server layer reads the local DB directly via server components/actions — no separate API to host; or (b) the frontend stack the prior project already stood up (React + TypeScript + Vite + a thin local API). The choice is a discovery/architecture decision, not settled here.
- **Graph rendering:** React Flow or Cytoscape.js for the canvas; an animation library (e.g. Framer Motion) for the collapse/re-center transitions.
- **Identity resolution:** People-chain identity data (migrated off the relay chain) — availability and archive coverage to be verified.

**Explicit discovery verification checklist (must pass before build):**

1. Does the chosen historical source expose OpenGov **referenda** with status, track, tally, and deposits — and in what shape? Does it give **decoded** governance events or only raw blocks requiring our own decode against runtime metadata?
2. Does it expose **individual conviction votes** (direction, conviction, balance) and **delegations** (delegator, delegate, track, conviction)? Confirm exact fields.
3. Does it expose **preimages / proposal calls** in a form we can decode to pallet · method · args?
4. Is **identity** available and resolvable to display names (People-chain archive coverage, judgement data), and how do we join it to accounts?
5. What is the **live source** (public RPC WebSocket) and does the transition from backfill to live sync work end to end?
6. Volume/perf reality check: total governance rows, DB size, and single-hop query latency on real data.

> **Prior-project constraint to reconcile in discovery:** the earlier GovGraph vision explicitly avoided Subsquid/GraphQL indexers (to minimize schema debugging) and mandated SubSquare/Subscan REST, while banning the (deprecated) Polkassembly API. OpenGov Atlas intentionally pivots toward a Subsquid-indexed local archive. This is a legitimate change of strategy, but the trade-off (schema/decoding effort vs. local speed and independence) and the source choice must be an explicit, evidence-based decision in the knowledge phase — not assumed.

---

## 10. MVP Scope & Success Criteria

**In scope for MVP:**

- Paginated, searchable, filterable referenda list.
- The split-layout referendum view (list + detail + graph canvas).
- Focused traversal with the standard expansion contract across Referendum → Proposal, Track, Proposer, Votes → Account, and recursive account expansion.
- Whale nodes + Minority Voters cluster + paginated searchable sidebar with re-center on click.
- Value-based color/size coding of votes.
- Back button + history/breadcrumb navigation.
- Local indexed store populated by a historical backfill with checkpointing.
- Deployment to a free host.

**Deferred / later:** live sync of brand-new events (nice-to-have if backfill lands first), deep transitive delegation pathfinding, cross-referendum analytics dashboards, multi-chain support (Kusama).

**Success criteria:**

- A user can go from the referenda list to any individual voter's delegation footprint purely by clicking, with each expansion feeling instant (single-digit-ms local reads).
- The canvas is never cluttered: at any moment it shows one center and its immediate children only.
- Vote influence (whales vs minority) and delegation direction are legible at a glance.
- Every external data claim in the build is backed by verified sample data, not assumption.

---

## 11. Open Questions for the Knowledge Phase

1. **"Value" for color coding:** conviction-weighted effective power (recommended) vs raw balance vs a hybrid — and the exact palette for Aye/Nay/Split/Abstain and direct vs delegated.
2. **Whale threshold:** fixed top-N, a percentage-of-turnout cutoff, or user-adjustable.
3. **App architecture:** meta-framework with direct DB reads vs the existing Vite/React frontend + thin local API — and whether the deployment target (a static/free host) constrains "local DB in the hot path."
4. **How much history:** all of OpenGov from genesis of Gov2, or a bounded recent window for the MVP.
5. **Live vs static:** does the MVP need live sync, or is a periodically-refreshed backfill enough?
6. **Identity edge cases:** accounts with no identity, sub-identities, and stale/parent judgements — how to display.
7. **Non-OpenGov governance:** whether Fellowship/collectives tracks are in or out of MVP scope.
8. **Data-source decision:** final source(s) and the decode strategy, resolved against the Section 9 checklist with real evidence.

---

*Prepared as the seed document for an AEOM knowledge-phase run. It is intentionally decision-light on technology and strictly evidence-gated: the knowledge phase must treat the **executed** Section 9 proof-of-feasibility — real packages run against real endpoints, with captured sample data — as a hard precondition to any implementation, and every contract and spec must be grounded on that proven evidence.*

---
artifact_id: "SPK-opengov-atlas-001"
artifact_type: spike_report
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: low
depends_on: ["PO-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
question: "Can @subsquid/substrate-processor, run against real SQD Network archive endpoints, download the complete set of Polkadot OpenGov governance entities (referenda + lifecycle/tally, conviction votes, delegations, preimages) from Asset Hub and identities from the People chain, decoded into inspectable shapes, with empty-block skipping that makes a full historical backfill tractable?"
time_box: "1 day"
code_location: "scratchpad/spike-indexer (gov.js, gov_rpc.js, identity.js) — DISPOSABLE, deleted after freeze; captured payloads preserved under .aeom/spikes/captured-payloads/"
---

# Spike Report — Executed proof-of-feasibility: Subsquid indexer downloads real OpenGov data

> This spike discharges the **hard evidence gate** the Product Overview inherits from the source (§9 "feasibility is established by *running code*, not reading docs"). Every claim below is `[E1]` — measured by real runs against real endpoints on 2026-07-07, with captured payloads preserved as inspectable files. Rate limit honored: SQD key `50 req/10s per IP`; archive requests are chunky and stayed well under it.

## 1. Question & Success Criteria

- **Question (from front-matter):** can an off-the-shelf Substrate indexer package download every OpenGov entity Atlas needs, decoded, from real decentralized-archive endpoints, fast enough for a full local backfill?
- **Decided in advance — thresholds:**
  - **YES** iff ≥1 real *decoded* payload is captured for each of: (a) referendum submission **with track**, plus a lifecycle event **carrying tally**; (b) a conviction **vote with direction + conviction + balance + voter**; (c) a **delegation with delegator + delegate + track** (conviction/balance available from the call); (d) a **preimage** (raw call bytes + hash); (e) a People-chain **identity display name** — AND the archive demonstrably **skips empty blocks** so a full backfill is tractable (projected ≪ 1 day of ingestion).
  - **NO** if any entity is unavailable or cannot be decoded from the archive.
  - **INCONCLUSIVE** if endpoints are unreachable/unauthorized within the time box.

## 2. Method

- **Package:** `@subsquid/substrate-processor@8.8.1` (+ `@subsquid/archive-registry`), Node v24.15.0 on Windows. Disposable driver implements the minimal `FinalDatabase` interface and `process.exit()`s once thresholds are met; a bounded/`to`-capped block range guarantees termination.
- **Endpoints (all real, resolved via `lookupArchive`):**
  - Governance archive: `https://v2.archive.subsquid.io/network/asset-hub-polkadot` (SQD Network v2, **API key required** post-2026-05-19; keyed run used the owner-supplied `SQD_API_KEY`).
  - Governance RPC (metadata/decode): `https://polkadot-asset-hub-rpc.polkadot.io` (specName `statemint`, specVersion `2003001`).
  - Identity archive: `https://v2.archive.subsquid.io/network/people-chain`; RPC `https://polkadot-people-rpc.polkadot.io` (specName `people-polkadot`, `2003000`).
- **Filters:** governance events+calls for the `Referenda`, `ConvictionVoting`, `Preimage` pallets; identity events+calls for the `Identity` pallet. Args requested via `.setFields({event:{args:true}, call:{args:true,origin:true,success:true}, ...})`; the archive serves **decoded JSON args** (no hand-rolled SCALE decoding needed for events/calls).
- **Environment note (reusable):** this host is behind a TLS-inspecting proxy; all node/npm calls required `NODE_OPTIONS=--use-system-ca` or they fail with cert errors that look like "no network."

## 3. Results (raw, reproducible)

**Run A — governance, keyed archive (Asset Hub):** window 800,000 blocks; terminated on core-data threshold after touching **599 non-empty blocks in 52.6 s**. Counts:

| Entity (event / call) | Count | Verified decoded fields (real values) |
|---|---|---|
| `Referenda.Submitted` / `.submit` | 2 / 2 | `index:1909`, `track:1`, `proposal:{hash, len:124, __kind:"Lookup"}`; proposer = submit-call `origin` (Signed `0xb031…e539`); `proposalOrigin.value.__kind:"WhitelistedCaller"` |
| `Referenda.DecisionStarted` | 2 | `index`, `track`, `tally:{ayes,nays,support}` |
| `Referenda.Confirmed` / `.Rejected` | 5 / 4 | `index`, **final `tally`** e.g. Confirmed #1908 `ayes:273719021101814478, nays:10000000000, support:1367024247629929834` |
| `Referenda.DecisionDepositPlaced` | 2 | `index`, `who` (deposit placer, distinct from proposer), `amount:100000000000000` |
| `ConvictionVoting.Voted` / `.vote` | 315 / 316 | `who`, `pollIndex`, `vote:{__kind:"Standard", vote:<byte>, balance}`; byte encodes direction+conviction: `0`=Nay/0.1×, `128`=Aye/0.1×, `130`=Aye/2×; whale balance `84500000000000000` (≈8.45M DOT) captured |
| `ConvictionVoting.Delegated` / `.delegate` | 40 / 40 | event = positional `[delegator, delegate, track]`; call adds `conviction:{__kind:"Locked3x"}`, `balance`, `class`(track), `to` |
| `ConvictionVoting.Undelegated` / `.undelegate` | 104 / 111 | delegator (event/origin), `class`(track) |
| `ConvictionVoting.VoteRemoved` / `.remove_vote` | 2 / 726 | vote retraction history present |
| `Preimage.note_preimage` | 8 | `bytes` = raw SCALE call (hex) + proposer origin; join to referendum by `proposal.hash` |
| `Preimage.Requested` | 8 | `{hash}` |

**Run B — identity, keyed archive (People chain):** window 800,000 blocks; terminated after **403 non-empty blocks in 23.8 s**. Counts: `Identity.set_identity`/`IdentitySet` 3, `provide_judgement`/`JudgementGiven` 1, `request_judgement` 1, `set_subs` 1, `clear_identity`/`IdentityCleared` 1. `set_identity.info.display` = `Raw` variant decoding to UTF-8 — captured names **"GtNode0", "LinkPool", "GtNode1"**; `IdentitySet` event carries `who`; same SS58 account key joins People-chain identity to Asset Hub governance accounts.

**Run C — keyless RPC-only (negative control on speed):** same processor, no archive, `~8 blocks/sec`; a 2,670-block recent window yielded **zero** governance items (governance is sparse per-block). Establishes that (i) the package decodes real data with no archive, but (ii) RPC-only is far too slow to backfill 17.9M blocks and cannot rely on stumbling onto sparse events — the **archive's empty-block skipping is essential** (599 relevant blocks found across a ~400k-block span in 53 s).

**Volume anchor:** Asset Hub `referendumCount ≈ 1919`; unfiltered `ConvictionVoting.votingFor` ≈ 44,296 entries [E3 — DIS-gov-graph-013]. At the archive's demonstrated relevant-block throughput, a full OpenGov backfill is minutes-to-low-hours, not days.

## 4. Conclusion

- **Answer: YES.** All five entity classes were downloaded and decoded from real archive endpoints with the supplied key, and the archive skips empty blocks, making a full historical backfill tractable. `@subsquid/substrate-processor` is a proven-feasible indexer for OpenGov Atlas.
- **Confidence and validity limits (what this does NOT prove):**
  1. **Vote sub-variants:** only `Standard` votes appeared in the sample; `Split {aye,nay}` and `SplitAbstain {aye,nay,abstain}` are known pallet shapes `[E2]` but were **not** captured `[E1]` — the adapter must handle all three (residual, low-risk; carried to the data contract).
  2. **Pre-migration history:** this proves the **Asset Hub** era (post-2025-11-04). OpenGov history before the migration lives on the `polkadot` relay-chain archive (also present in the registry) and needs the **same run against that gateway** to confirm the older runtime decodes — carried as a bounded follow-up in the FM/Architecture (History-window decision A-06).
  3. **Preimage decoding:** raw `bytes` are available; decoding them to pallet·method·args requires a SCALE decode against runtime metadata (standard; `@polkadot/api`/`@subsquid/substrate-runtime` do this) — proven-available, decode step deferred to implementation.
  4. **Delegation conviction/balance completeness:** the `Delegated` event gives relationship+track; conviction+balance come from the `delegate` call (or current `VotingFor` storage). The contract must combine sources for full delegation attributes.
  5. **Key/rate constraints:** the v2 archive **requires an API key** (owner-supplied) and enforces `50 req/10s/IP`; unkeyed archive access is no longer available. This is an operational dependency for backfill, not a blocker.
- **Recommendation to the commissioning artifact (FM-opengov-atlas-001):** adopt `@subsquid/substrate-processor` as the indexer; target `asset-hub-polkadot` (governance) + `people-chain` (identity) + `polkadot` (pre-migration history) SQD gateways with the keyed archive; source individual votes/delegations from **events** (voter/delegator explicit) enriched by calls; this axis is decided on `[E1]` evidence and is free to freeze.

## 5. Knowledge Propagation (Harness completes)

| Field | Value |
|---|---|
| Evidence consumed by (artifact ID §) | FM-opengov-atlas-001 §2–§6; ARCHITECTURE_SPEC data model & contracts; captured payloads preserved at `.aeom/spikes/captured-payloads/` |
| Spike code deleted on (date) | Pending FM freeze (disposable driver in scratchpad; captured payloads retained as evidence) |

## 6. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | quality | approve | Falsifiable singular question + pre-declared thresholds present; §3 reports raw measurements (counts, real field values, timings), not adjectives; the five validity limits in §4 are honestly scoped rather than hidden. Captured payloads are preserved and inspectable under `.aeom/spikes/captured-payloads/`, satisfying "evidence, not assertion." Corroborates the standing memory guidance to verify real round-trips with known-nonzero content — whale balances, real display names, and non-zero tallies were asserted against, not just "did it run." |
| 2026-07-07 | performance | approve | Performance-relevant claims are [E1]: 599 governance blocks / 52.6 s and 403 identity blocks / 23.8 s via the archive vs ~8 blocks/s RPC-only (negative control). Empty-block skipping is demonstrated, not assumed. Non-blocking Suggestion (SUG-SPK-P1): the "minutes-to-low-hours full backfill" projection is an extrapolation — Architecture §5 must name an executable benchmark that measures the *actual* end-to-end backfill duration and DB size on real data before that number is treated as verified (feeds PO §7 success metrics and A-03/A-05). |

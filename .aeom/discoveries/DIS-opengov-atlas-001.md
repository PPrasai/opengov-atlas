---
artifact_id: "DIS-opengov-atlas-001"
artifact_type: discovery
project: "opengov-atlas"
version: 0.1.0
state: frozen
risk_tier: high
depends_on: ["CON-opengov-atlas-002", "AS-opengov-atlas-001", "SPEC-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
discovered_during: "spike:SPK-opengov-atlas-003 (relay pre-migration decode / DB-size projection)"
implementation_paused: false
---

# Discovery — Relay-era OpenGov cross-runtime deltas (vote source, delegation shape) + measured DB-size inputs

> Logged during SPK-003. The frozen contracts were grounded only on Asset-Hub-era (post-2025-11-04) payloads; running the same processor against the `polkadot` relay archive surfaced real cross-runtime shape differences the decode contract must handle, plus the measured inputs the serving-model decision needs. Facts in §2 are [E1] (real captured payloads); proposals in §4 are for governance.

## 1. What Was Being Attempted

Discharging A-06 / UNK-02 (SPK-003): prove the pre-migration relay runtime decodes the same OpenGov entities as Asset Hub, and produce a measured full-history DB-size projection to pick the serving model and MVP history scope.

## 2. What Was Discovered (observed facts only, evidence-tagged)

- **D-1 — Relay pre-migration emits NO `ConvictionVoting.Voted` event; votes exist only as `ConvictionVoting.vote` calls.** [E1] Across the full relay Gov2 era (blocks 15.8M→28.6M) the census counted **28,608 `Voted` events vs 220,335 `vote` calls**. In a 300k-block 2024 window the same asymmetry held (0 events / 7,412 calls). The `Voted`/`VoteRemoved` events were added to the ConvictionVoting pallet in a later runtime that shipped on Asset Hub; SPK-001 saw 315 `Voted` events on Asset Hub. **Consequence:** ADR-04 ("source votes from events, explicit `who`") is only realizable in the Asset-Hub era. In the relay era votes MUST be sourced from the **`vote` call**, with `voter = call Signed origin` (captured real origins, e.g. `0x2e33…a63e`).
- **D-2 — Relay `ConvictionVoting.Delegated` event carries only 2 positional args `[delegator, delegate]` (no track).** [E1] Relay capture: `["0x76e7…d708","0x6320…e9a0"]`. Asset-Hub capture (SPK-001): `["0x9859…eb24","0x6320…e9a0", 2]` — **3 args incl. track**. **Consequence:** on relay, delegation `track` must come from the paired `ConvictionVoting.delegate` call's `class` field (captured: `{class:0, to, conviction:Locked2x, balance}`), not the event.
- **D-3 — Vote variants Split and SplitAbstain are real and present in history (closes UNK-03).** [E1] Census kind distribution (relay era): Standard 203,591, **Split 901**, **SplitAbstain 15,843**. Captured real fixtures of each; all three decode and insert through the CON-002 mapping with correct `effective_weight` (`CON-002_vote_variant_validation.json`, integrity_check ok). Split/SplitAbstain are conviction-less (0.1×).
- **D-4 — Treasury preimages decode to `treasury.spendLocal {amount, beneficiary.Id}`; some referenda wrap the payload.** [E1] Decoding 50 real relay preimages via `@polkadot/api` at the noting block: 39× `treasury.spendLocal` (real e.g. `amount 56000000000000` → beneficiary `11jAHd8…`), plus `bounties.*`, `whitelist.dispatchWhitelistedCallWithPreimage` ×3, `utility.batchAll`, `system.setCode`, `referenda.cancel`. **Consequence:** the `pays → beneficiary` edge is proven, but treasury spends may be **nested** inside `whitelist.dispatch*` / `utility.batch*` wrappers, so preimage decode must unwrap one level to find `treasury.spend*`.
- **D-5 — Measured per-table bytes/row (CON-001 schema, all indexes, worst-case field widths).** [E1] vote 247 B/row, delegation 330, referendum 419, preimage 392, account 200 (`SPK-003_bytes_per_row.json`). With measured real total row counts this yields the full-DB size projection in SPK-003 §3.
- **D-6 — Referendum index is a single continuous counter across the migration.** [E1] Relay `referenda.referendumCount` now reads 0 (governance pallets cleared from relay post-migration); Asset Hub `referendumCount = 1919` continues the global index. Relay era holds indices 0..1,782−1; Asset Hub holds the remainder to 1918.
- **D-7 — Vote `balance × conviction` overflows SQLite i64.** [E1] The real backfill threw `BigInt value is too large to bind` at a whale vote: the largest balances at 6× conviction exceed 9.22×10¹⁸ planck (i64 max). **Consequence:** high-cardinality amounts (`vote.balance/effective_weight/aye/nay/abstain`, `delegation.balance`) MUST be stored as **8-byte REAL planck** (same size as INTEGER, sorts numerically for the whale index, no overflow) — not INTEGER. Per-referendum tallies stay TEXT (tiny table, exactness preserved).
- **D-8 — Owner-directed storage optimization: intern addresses + integer enums + BLOB keys (closes A-16).** [E1] Interning every 32-byte address to an auto-increment `account.id` (true pubkey kept once in `account.pubkey` BLOB, SS58 derived at display), plus integer enums and BLOB hashes, cuts measured bytes/row: vote 247→88, delegation 330→58, account 200→97. Full-history DB projects from ~91 MB (baseline) to **~32 MB (optimized)**; real measured build in SPK-003 §3f.
- **D-9 — The full recursive graph resolves end-to-end.** [E1] Built the real `atlas.db` and walked Referendum→Proposer→their Referenda→Votes→Voter→Delegations→… as single-hop indexed lookups with **no dead-ends**, including a loop back to an already-visited node. **Consequence:** the breadcrumb (CAP-007/CON-004) must **auto-collapse to the earlier occurrence** when a traversal re-enters a visited node — strengthening QA-08. Completeness stats (proposer/preimage availability) in SPK-003 §3g.

## 3. Impacted Knowledge

| Artifact ID | Section | Nature of impact | Blocking? |
|---|---|---|---|
| CON-opengov-atlas-001 | §1 DDL; §2 node-id; §3 DAL; §4 whale | Incomplete — adopt optimized schema (interned account ids, REAL planck amounts, integer enums, BLOB pubkey/hash) [D-7/D-8]; whale default top-9+1; node-id stays address-canonical | Yes (high-tier, owner-directed) |
| CON-opengov-atlas-002 | §1 vote/delegation rows; §2 robustness; §3 validation | Incomplete — add era-conditional vote source (call vs event), 2-arg relay Delegated, treasury nested-wrapper unwrap, address-interning step; Split/SplitAbstain now [E1] not [E2] | Yes (high-tier correctness) |
| AS-opengov-atlas-001 | §9 ADR-04/06; §10 A-06/16/17/UNK-03; new ADR-08/09 | ADR-04 relay caveat; ADR-06 top-9 default; add ADR-08 (serving-model size threshold, ship-whole primary) + ADR-09 (interned-integer storage); resolve A-06/16/17/UNK-03; breadcrumb loop-collapse [D-9] | Yes |
| SPEC-opengov-atlas-001 | §1 slice 0; §2 QA-03/04/07 | Slice 0 discharged; QA-04/QA-07 fixtures now real; QA-03 budget = measured size ≤ 75 MB | No |
| FM-opengov-atlas-001 | §5 UNK-02/03 | Resolved, but **no FM decision changes** (relay DOES decode via Subsquid; stack unchanged; flip-conditions untriggered) — left frozen, resolution recorded here + SPK-003 | No |

## 4. Proposed Knowledge Update

Update CON-001 to the **optimized schema** (interned integer account ids with a `account(id, pubkey BLOB)` dictionary, REAL planck amounts, integer enums, BLOB hashes; whale default top-9+1; node-id scheme stays address-canonical, resolved id↔addr by the DAL). Update CON-002 with an **era-conditional decode** section (relay: votes from `vote` call, delegation track from `delegate` call; Asset Hub: votes/delegation from events), an **address-interning** step, and a **treasury nested-unwrap** rule; flip Split/SplitAbstain to [E1]. Update AS: caveat ADR-04, top-9 default in ADR-06, add **ADR-08 (serving-model size threshold; ship-whole primary)** + **ADR-09 (interned-integer storage)**, **breadcrumb loop auto-collapse**, resolve A-06/16/17/UNK-03. Update SPEC: slice 0 discharged, QA-04/QA-07 point at real fixtures, QA-03 budget = measured size ≤ 75 MB. Leave FM frozen.

## 5. Governance Triage (Harness/authority completes)

| Field | Value |
|---|---|
| Risk tier assigned | high (touches high-tier contract CON-002 + architecture) |
| Action | update artifacts CON-002, AS, SPEC via change-request; accept-and-record for FM |
| change_requested raised on | CON-opengov-atlas-001, CON-opengov-atlas-002, AS-opengov-atlas-001, SPEC-opengov-atlas-001 |
| Implementation resume condition | N/A — planning phase; no implementation in progress |

## 6. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | architecture | approve | Cross-runtime deltas (D-1/D-2) are real and correctly routed to CON-002 as era-conditional decode; keeps events-primary on Asset Hub (ADR-04 intact there) while making relay votes call-sourced. No new component needed — all within the existing Decode/Adapter. |
| 2026-07-07 | quality | approve | Every §2 fact is backed by a captured payload or a census count; D-3/D-5 come with executed validations (integrity_check ok; measured bytes/row). Proposals (§4) are separated from facts (§2). |

---
artifact_id: "CON-opengov-atlas-002"
artifact_type: contract
project: "opengov-atlas"
version: 0.3.1
state: frozen
risk_tier: high
depends_on: ["AS-opengov-atlas-001", "SPK-opengov-atlas-001", "CON-opengov-atlas-001"]
supersedes: null
owners: ["Parikshit"]
---

# Contract — Backfill Decode Mapping (archive JSON → store rows)

> Realizes AS §7 CON-003. Every mapping row is grounded on a **real captured SPK-001 payload** (`.aeom/spikes/captured-payloads/`) and was executed against the CON-001 schema (validation log `CON-001_validation.json`, [E1]). This is the correctness contract for all data (QA-04/05/07).

## 1. Source → row mappings

> **Era-conditional decode (SPK-003 [E1], DIS-001 D-1/D-2).** OpenGov spans two runtimes. **Asset-Hub era (post-2025-11-04):** votes and delegations come from **events** (`ConvictionVoting.Voted`/`Delegated`, explicit `who`) — ADR-04. **Relay pre-migration era (indices 0–1781):** the runtime emits **no `Voted` event** — votes come from the **`ConvictionVoting.vote` call** (`voter = call Signed origin`); and the relay **`Delegated` event has only 2 args `[delegator, delegate]`** (no track), so delegation `track` comes from the paired **`delegate` call's `class`**. The adapter selects source by chain/spec, not per-item guesswork. Late-relay blocks emit *both* a `vote` call and a `Voted` event for the same vote — the **call is the canonical de-dup key** on relay (else double-count). Delegations are sourced from the **`delegate` call** uniformly (it carries delegator+delegate+track+conviction+balance in both eras).
>
> **Address interning (owner-directed, CON-001 §1).** Every account address (`who`/origin/`to`/`beneficiary`/proposer) is resolved to an integer `account.id` via an intern step — `intern(pubkey)`: look up `account.pubkey` (BLOB), insert if new, return `id`. All FK columns (`voter_id`, `proposer_id`, `delegator_id`, `beneficiary_id`, …) store the id; the true pubkey lives once in `account`. Amounts are stored as **REAL planck** (i64-overflow-safe, DIS-001 D-7).

| Source (chain / pallet.item) | Kind | → Store row (CON-001) | Field mapping (from captured payload) |
|---|---|---|---|
| Asset Hub `Referenda.Submitted` (event) | referendum | `referendum` | `index→idx`, `track→track`, `proposal.hash→proposal_hash`, `proposal.__kind→proposal_kind` ('Lookup'/'Inline'/'Legacy'), `status='Submitted'`, `block→submitted_block` |
| Asset Hub `Referenda.submit` (call) | proposer | `referendum.proposer` | `origin.value.value→proposer` (Signed account); `proposalOrigin.value.__kind→track name` cross-check |
| `Referenda.DecisionStarted` (event) | status/tally | `referendum` | `status='Deciding'`, `tally.{ayes,nays,support}`, `block→decided_block` |
| `Referenda.Confirmed/Approved/Rejected/TimedOut/Cancelled` (event) | terminal status | `referendum` | `status=<event>`, final `tally.{ayes,nays,support}`, `block→confirmed_block` |
| `Referenda.DecisionDepositPlaced` (event) | deposit | `referendum.decision_deposit_who` | `who→decision_deposit_who`, `amount` |
| **AH:** `ConvictionVoting.Voted` (event) · **Relay:** `ConvictionVoting.vote` (call) — era-conditional vote source | vote | `vote` | voter = event `who` (AH) / call Signed origin (relay) → `intern`→`voter_id`; `pollIndex→poll`; `vote.__kind`→variant: **Standard** `{vote,balance}`→`direction`0/1(byte&0x80?Aye:Nay), `conviction`(byte&0x7f), `balance`; **Split** `{aye,nay}`→`direction=2`,`aye_balance`,`nay_balance`; **SplitAbstain** `{aye,nay,abstain}`→`direction=3`,+`abstain_balance`. `effective_weight = balance × convictionMult` (0→0.1×, 1..6→1..6×; Split/SplitAbstain conviction-less at 0.1×) stored **REAL planck**. **UPSERT to the latest AccountVote per (voter, poll)** (`ux_vote_voter_poll`): a later `vote` call **replaces** the earlier row (`ON CONFLICT(voter_id,poll) DO UPDATE`, latest `block` wins) — the chain keeps only one AccountVote per referendum; without this, one automated re-voter inflated poll 1042 to 1,614 rows for 58 real voters (DIS-002 D-11). Validated [E1] all 3 variants: `CON-002_vote_variant_validation.json` (whale 84.5e15 @2× → 169e15; Split aye150e9+nay150e9→eff 30e9). |
| `ConvictionVoting.VoteRemoved` (event) | vote retraction | `vote.active=0` | mark the matching (voter, poll) vote inactive |
| `ConvictionVoting.delegate` (call) — **uniform delegation source** | delegation | `delegation` | delegator = Signed origin→`intern`→`delegator_id`; `to.value`→`intern`→`delegate_id`; `class`→`track`; `conviction.__kind`(Locked_x→int); `balance`(REAL); `active=1`. Chosen over the event because the relay `Delegated` event has only 2 args `[delegator,delegate]` (no track, DIS-001 D-2) while the AH event has 3 — the call carries all fields in both eras. |
| `ConvictionVoting.Undelegated`/`Delegated` (events) | cross-check | — | events corroborate the relationship; on AH the `Delegated` 3rd arg = track; on relay track is call-only (D-2). |
| `ConvictionVoting.Undelegated` (event) | delegation end | `delegation.active=0` | mark (delegator, track) inactive |
| `Preimage.note_preimage` (call) + `Referenda.Submitted` Inline proposals | preimage | `preimage` | `hash=blake2_256(bytes)`→BLOB, `len`, `origin→intern→proposer_id`, raw `bytes`→BLOB (**build-only**: decode input, dropped from the shipped DB — §2 publish step). Build-time `@polkadot/api` decode at the noting block → `decoded_pallet/method/args_json`; **treasury** (`treasury.spend`/`spendLocal`) → `beneficiary→intern→beneficiary_id`, `amount`(REAL). **Unwrap one level** for nested spends inside `whitelist.dispatchWhitelistedCallWithPreimage` / `utility.batch*` (DIS-001 D-4). Inline proposals (`Submitted.proposal.__kind='Inline'`) stored as a preimage keyed by `blake2_256(inlineBytes)`. `available=1`. Validated [E1]: `relay_preimage_treasury_decoded.json` (39× `treasury.spendLocal`). |
| People `Identity.set_identity` (call) | identity | `account` | `origin→addr`, `info.display` Raw→UTF-8→`display` (validated [E1]: "GtNode0","LinkPool"); other fields→extended info |
| People `Identity.JudgementGiven`/`provide_judgement` | judgement | `account.judgement` | `judgement.__kind`→`judgement` (e.g. KnownGood/Reasonable) |
| People `Identity.set_subs` / sub events | sub-identity | `account.parent` | sub→parent mapping |
| Runtime consts (`@polkadot/api`) | track defs | `track` | Referenda track list → `id,name,decision_period,confirm_period,min_approval,min_support,decision_deposit` (not events — A-15) |

## 2. Robustness rules (from gov-graph [E3])

- Tolerate **`null` and `undefined`** and absent fields — Subscan-era schema-strictness bugs (DIS-gov-graph-016) taught that upstream returns explicit `null`; the adapter must `.nullable()` optional fields, never hard-fail a whole batch.
- **Proposer best-effort:** proposer comes from the `submit` call; if unavailable for the oldest referenda, degrade to a labeled placeholder (never a silent 0) [E3 — DIS-gov-graph-014].
- **Cross-runtime:** decode must not assume one spec version; event/call shapes differ pre/post Asset Hub migration — now **proven [E1]** (SPK-003/DIS-001): relay votes = calls (no `Voted` event), relay `Delegated` = 2 args. The adapter branches on chain/spec, not per-item guessing. The archive serves already-decoded JSON, absorbing the rest.
- **Idempotent & resumable:** re-running the backfill over a block range produces the same rows (votes upsert on **`(voter_id, poll)` keeping the latest `block`** — DIS-002 D-11; other rows keyed by natural id); resume from last-synced block adds no duplicate active vote (QA-02). **Interning is deterministic within a build** (`account.pubkey` UNIQUE ⇒ one id per address); integer ids are **not stable across full rebuilds**, which is why node ids/URLs use the SS58 address, never the id (CON-001 §2).
- **Publish step (build → shipped, DIS-002 D-10):** after decode, the Builder emits the shipped `atlas.db` by **dropping `preimage.bytes`** (`UPDATE preimage SET bytes=NULL; VACUUM`) — the raw SCALE bytes are a decode input (53% of the build DB) the browser never reads. The manifest records `shipped=true`; CI asserts the published DB has no non-null `preimage.bytes` (QA-03/QA-10 adjacent).

## 3. Validation (executed [E1])

The mappings for `Referenda.Submitted`, `Referenda.Confirmed` (tally), `ConvictionVoting.Voted`/`.vote` (**all three variants** Standard/Split/SplitAbstain, effective_weight), `ConvictionVoting.delegate`, `Preimage.note_preimage` (incl. treasury spend beneficiary+amount), and `Identity.set_identity` (Raw→UTF-8) were executed against real captured payloads and inserted cleanly into the CON-001 schema — see `CON-001_validation.json`, `CON-002_vote_variant_validation.json` (integrity_check ok, kinds `[Split,SplitAbstain,Standard]`), `relay_preimage_treasury_decoded.json`, and the full-scale `graph_closure_analysis.json`. **UNK-03 is CLOSED [E1]:** Split (912) and SplitAbstain (16,450) are real, captured, and decode with correct `effective_weight` (SPK-003 §3c). CI check: fixture-based decode tests feed each captured payload type (all vote variants, treasury preimage, both delegation-arg shapes) and assert the mapped row.

## 4. Review Log

| Date | Reviewer domain | Verdict | Issues raised (IDs) |
|---|---|---|---|
| 2026-07-07 | architecture | approve | Every mapping traces to a captured payload; events-as-primary-source (ADR-04) correctly avoids proxy/batch origin ambiguity. Idempotent/resumable rules support QA-02. |
| 2026-07-07 | quality | approve | Fixture-based decode tests against real captured payloads are specified; the Split/SplitAbstain residual (UNK-03) is disclosed with a concrete verification path, not hidden. |
| 2026-07-07 | performance | approve | Decode is build-time only; no query-hot-path cost. |
| 2026-07-07 | security | approve | Preimage/identity text flagged as externally-authored → sanitized before DOM (QA-14); no secret handling here. |
| 2026-07-07 | architecture + quality (v0.2.x change, evidence DIS-001/SPK-003) | approve | Era-conditional vote source (relay=`vote` call, AH=`Voted` event) correctly handles the runtime delta with no double-count (call is the relay canonical key); delegation uniformly from the `delegate` call (relay `Delegated` is 2-arg); treasury nested-unwrap + Inline-as-preimage added; address-interning step specified. UNK-03 closed [E1] — all three vote variants validated (integrity_check ok). Every mapping still traces to a captured payload. |
| 2026-07-08 | architecture + quality (v0.3.0 change, evidence DIS-002/SPK-003) | approve | Two real-build corrections: vote mapping now **upserts to the latest AccountVote per (voter, poll)** — matches chain semantics (one AccountVote/referendum) and stops a 1,550-revote bot from inflating a poll; and a **strip-`preimage.bytes` publish step** produces the ~19 MB shipped DB from the ~42 MB build DB (bytes are a build-only decode input). Both trace to measured facts; idempotency/QA-02 updated to the new upsert key. |

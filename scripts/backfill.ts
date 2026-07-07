import { SubstrateBatchProcessor, DataHandlerContext } from '@subsquid/substrate-processor';
import { Store } from '@subsquid/typeorm-store';
import { initializeDatabase } from './schema.js';

// NOTE: This is the skeleton of the backfill pipeline. 
// A full implementation requires generated types from typegen.
// Because we are hydrating from the SPK-003 seed, the full historical backfill
// is skipped in CI, but the pipeline structure is provided here.

const processor = new SubstrateBatchProcessor()
  .setDataSource({
    archive: 'https://v2.archive.subsquid.io/network/polkadot-asset-hub',
    chain: 'wss://polkadot-asset-hub-rpc.polkadot.io'
  })
  .addEvent({
    name: ['ConvictionVoting.Voted', 'ConvictionVoting.Delegated', 'ConvictionVoting.Undelegated'],
    call: true,
    extrinsic: true
  })
  .addEvent({
    name: ['Referenda.Submitted', 'Referenda.DecisionStarted', 'Referenda.Confirmed', 'Referenda.Rejected', 'Referenda.Approved', 'Referenda.Cancelled', 'Referenda.TimedOut', 'Referenda.Killed'],
    call: true,
    extrinsic: true
  })
  .addCall({
    name: ['Preimage.note_preimage'],
    extrinsic: true
  });

type Fields = typeof processor extends SubstrateBatchProcessor<infer F> ? F : never;
type Context = DataHandlerContext<Store, Fields>;

export async function processBlocks(ctx: Context) {
  const db = initializeDatabase('public/atlas.db');

  for (const block of ctx.blocks) {
    for (const event of block.events) {
      if (event.name === 'Referenda.Submitted') {
        // Handle referendum submission
        // Example logic:
        // const { track, index, proposal } = new ReferendaSubmittedEvent(ctx, event).asV1002000;
        // db.prepare(`INSERT INTO referendum (idx, track, status, submitted_block, proposal_kind) VALUES (?, ?, ?, ?, ?)`).run(...);
      } else if (event.name === 'ConvictionVoting.Voted') {
        // Handle votes (Asset Hub era)
        // db.prepare(`INSERT INTO vote (...) ... ON CONFLICT(voter_id, poll) DO UPDATE SET ...`).run(...);
      }
    }

    for (const call of block.calls) {
      if (call.name === 'ConvictionVoting.delegate') {
        // Handle delegation uniformly from call (both relay and AH era)
      } else if (call.name === 'ConvictionVoting.vote') {
        // Handle votes (Relay era)
      }
    }
  }

  // After backfill, perform the publish step (strip raw SCALE bytes)
  db.prepare(`UPDATE preimage SET bytes = NULL`).run();
  db.prepare(`VACUUM`).run();
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('shipped', 'true')`).run();
  db.close();
}

// In a real run, this would be executed:
// processor.run(new TypeormDatabase({ supportHotBlocks: false }), async (ctx) => {
//   await processBlocks(ctx);
// });

import { ApiPromise, WsProvider } from '@polkadot/api';
import Database from 'better-sqlite3';
import path from 'path';

process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
  process.exit(1);
});

async function main() {
  console.log('Connecting to Polkadot...');
  const provider = new WsProvider('wss://rpc.polkadot.io');
  const api = await ApiPromise.create({ provider });

  console.log('Opening database...');
  const db = new Database(path.join(process.cwd(), 'public', 'atlas.db'));

  console.log('Fetching referenda...');
  const referenda = await api.query.referenda.referendumInfoFor.entries();
  
  let updatedCount = 0;
  
  const insertOrUpdate = db.prepare(`
    INSERT INTO referendum (idx, track, status, ayes, nays, support, submitted_block) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(idx) DO UPDATE SET 
      status = excluded.status, 
      ayes = excluded.ayes, 
      nays = excluded.nays, 
      support = excluded.support
  `);

  try {
    for (const [key, option] of referenda) {
      if (option.isNone) continue;
      
      const idx = key.args[0].toNumber();
      const info = option.unwrap();
      
      if (info.isOngoing) {
        const ongoing = info.asOngoing;
        
        const track = ongoing.track.toNumber();
        const status = 0; // 0 = Ongoing
        const ayes = ongoing.tally.ayes.toString();
        const nays = ongoing.tally.nays.toString();
        const support = ongoing.tally.support.toString();
        const submitted_block = ongoing.submitted.toNumber();

        insertOrUpdate.run(idx, track, status, ayes, nays, support, submitted_block);
        updatedCount++;
      } else if (info.isApproved) {
        // Just update status if it exists, otherwise ignore (it's historic)
        db.prepare(`UPDATE referendum SET status = 1 WHERE idx = ?`).run(idx);
      } else if (info.isRejected) {
        db.prepare(`UPDATE referendum SET status = 2 WHERE idx = ?`).run(idx);
      }
    }

    db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('built_at', ?)`).run(new Date().toISOString());

  } catch (err) {
    console.error('Error processing referenda:', err);
  }

  console.log(`Updated ${updatedCount} active referenda.`);
  
  db.close();
  await api.disconnect();
  console.log('Done!');
}

main().catch(console.error);

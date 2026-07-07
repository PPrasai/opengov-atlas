import Database from 'better-sqlite3';

export function verifyDatabase(dbPath: string) {
  const db = new Database(dbPath);
  
  // 1. Run integrity check
  const integrityCheck = db.pragma('integrity_check', { simple: true });
  console.log('Integrity check:', integrityCheck);
  
  // 2. Assert no duplicate active votes per voter/poll
  const duplicateVotes = db.prepare(`
    SELECT voter_id, poll, COUNT(*) as c
    FROM vote
    WHERE active = 1
    GROUP BY voter_id, poll
    HAVING c > 1
  `).all();
  
  if (duplicateVotes.length > 0) {
    console.error('Duplicate active votes found:', duplicateVotes);
    process.exit(1);
  }
  
  // 3. Assert shipped DB has no preimage bytes
  const preimageBytesCount = db.prepare(`
    SELECT COUNT(*) as c FROM preimage WHERE bytes IS NOT NULL
  `).get() as { c: number };
  
  if (preimageBytesCount.c > 0) {
    console.error(`Found ${preimageBytesCount.c} preimages with raw bytes. Shipped DB must strip bytes.`);
    process.exit(1);
  }

  // 4. Print manifest
  const manifest = db.prepare(`SELECT * FROM meta`).all();
  console.log('Manifest:', manifest);

  console.log('Verification passed.');
}

if (require.main === module) {
  const dbPath = process.argv[2] || 'public/atlas.db';
  verifyDatabase(dbPath);
}

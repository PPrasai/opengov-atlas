import Database from 'better-sqlite3';

export function initializeDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // Use WAL mode for better performance
  db.pragma('journal_mode = WAL');

  // account is the address dictionary: the ONE place a public key is stored; FKs elsewhere use id.
  db.exec(`
    CREATE TABLE IF NOT EXISTS account(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pubkey BLOB NOT NULL UNIQUE,
      display TEXT,
      judgement INTEGER,
      parent_id INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS referendum(
      idx INTEGER PRIMARY KEY,
      track INTEGER NOT NULL,
      status INTEGER NOT NULL,
      ayes TEXT NOT NULL DEFAULT '0',
      nays TEXT NOT NULL DEFAULT '0',
      support TEXT NOT NULL DEFAULT '0',
      proposal_hash BLOB,
      proposal_kind INTEGER,
      proposer_id INTEGER,
      decision_deposit_who_id INTEGER,
      submitted_block INTEGER,
      decided_block INTEGER,
      confirmed_block INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS track(
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      decision_period INTEGER,
      confirm_period INTEGER,
      min_approval TEXT,
      min_support TEXT,
      decision_deposit REAL
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS preimage(
      hash BLOB PRIMARY KEY,
      len INTEGER,
      decoded_pallet TEXT,
      decoded_method TEXT,
      decoded_args_json TEXT,
      beneficiary_id INTEGER,
      amount REAL,
      proposer_id INTEGER,
      bytes BLOB,
      available INTEGER
    );
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS vote(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      voter_id INTEGER NOT NULL,
      poll INTEGER NOT NULL,
      direction INTEGER NOT NULL,
      conviction INTEGER NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      aye_balance REAL,
      nay_balance REAL,
      abstain_balance REAL,
      effective_weight REAL NOT NULL DEFAULT 0,
      is_delegated INTEGER NOT NULL DEFAULT 0,
      block INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ux_vote_voter_poll ON vote(voter_id, poll);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS delegation(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      delegator_id INTEGER NOT NULL,
      delegate_id INTEGER NOT NULL,
      track INTEGER NOT NULL,
      conviction INTEGER,
      balance REAL,
      block INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS ix_vote_poll ON vote(poll);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_vote_voter ON vote(voter_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_vote_whale ON vote(poll, effective_weight DESC);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_del_from ON delegation(delegator_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_del_to ON delegation(delegate_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_ref_track ON referendum(track);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_ref_status ON referendum(status);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_ref_prop ON referendum(proposer_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_pre_benef ON preimage(beneficiary_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS ix_acct_display ON account(display);`);

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta(
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Insert schema version
  db.prepare(`INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', '1')`).run();

  return db;
}

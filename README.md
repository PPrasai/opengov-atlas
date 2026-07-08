# Opengov Atlas

Opengov Atlas is an interactive, physics-based visualization graph built to explore Polkadot's OpenGov relationships. It allows users to deeply investigate accounts, referenda, votes, and delegations in an intuitive, fully mapped network.

## Features

- **Massive Relationship Mapping**: Traverse an unfiltered history of Polkadot's OpenGov without missing relationships or hitting dead ends.
- **Physics Engine & Caching**: Powered by a custom `d3-force` physics engine in a WebWorker, allowing smooth node grouping, with an instant `useRef`-based caching layer for 0ms latency navigation of previously visited nodes.
- **Virtual Folders (Boxing)**: Intelligently handles giant nodes (like whale delegators) by grouping them into a "Box". Zoom in to view tiny swarming nodes to prevent visual hairballs!
- **Accurate Topology**: Exposes hidden foreign-key relationships including sub-identities, and accurately maps natural graph typologies without artificially breaking connections.
- **Global Search & Deep Linking**: Instantly search for any SS58 account address, or share your exact traversal state with URL query parameters.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the development server:
   ```bash
   npm run dev
   ```

## Production Build

To build the application for production:
```bash
npm run build
```

## Data Syncing

If you are on Windows and lack Visual Studio C++ build tools, you can use Docker to safely update the database without SSL or `better-sqlite3` build errors:

To install the Subsquid/SQLite dependencies via Docker:
```bash
docker run --rm -v "${PWD}:/app" -w /app node:20 npm install
```

To fetch the latest ongoing referenda blocks and update the local database directly from the Polkadot RPC:
```bash
docker run --rm -v "${PWD}:/app" -w /app node:20 bash -c "node --no-warnings --loader ts-node/esm scripts/update-latest.ts"
```

To run the standard Subsquid backfill pipeline (requires implementing the parsing skeleton):
```bash
npm run backfill
```

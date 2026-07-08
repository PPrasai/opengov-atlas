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

To fetch the latest blocks and update the SQLite database:
```bash
npm run backfill
```

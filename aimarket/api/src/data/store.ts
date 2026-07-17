import type { DataStore } from './interfaces.js';

/**
 * Factory: selects the data-layer implementation from the DATA_PROVIDER env
 * var (default `sqlite`). Route handlers depend only on the DataStore
 * interface and never import a concrete database client.
 */
export async function createStore(): Promise<DataStore> {
  const provider = (process.env.DATA_PROVIDER || 'sqlite').toLowerCase();
  switch (provider) {
    case 'sqlite':
      return (await import('./sqlite.js')).createSqliteStore();
    // Placeholders for Azure providers wired up in later phases.
    case 'cosmos':
      throw new Error('DATA_PROVIDER=cosmos is not implemented in Phase 1');
    case 'postgres':
      throw new Error('DATA_PROVIDER=postgres is not implemented in Phase 1');
    default:
      throw new Error(`Unknown DATA_PROVIDER: ${provider}`);
  }
}

export type { DataStore };

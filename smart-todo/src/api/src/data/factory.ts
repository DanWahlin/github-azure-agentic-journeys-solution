import type { DataStore } from './repositories.js';
import { SqlDataStore } from './sqlDataStore.js';
import { MemoryDataStore } from './memoryDataStore.js';

let cached: DataStore | null = null;
let initializing: Promise<DataStore> | null = null;

/**
 * Creates the concrete DataStore based on configuration. Defaults to the Azure
 * SQL implementation (managed identity). Set DATA_STORE=memory for a
 * dependency-free local/dev store — never used in Azure.
 */
function createDataStore(): DataStore {
  const kind = (process.env.DATA_STORE ?? 'sql').toLowerCase();
  if (kind === 'memory') {
    return new MemoryDataStore({ seed: true });
  }
  return new SqlDataStore();
}

/**
 * Returns a singleton DataStore, running initialize() exactly once. HTTP
 * handlers call this instead of importing a database client directly, so the
 * CREATE TABLE IF NOT EXISTS cost is paid on the first request only.
 */
export async function getDataStore(): Promise<DataStore> {
  if (cached) return cached;
  if (!initializing) {
    initializing = (async () => {
      const store = createDataStore();
      await store.initialize();
      cached = store;
      return store;
    })();
  }
  return initializing;
}

/** Test helper: clears the cached DataStore so a fresh one can be created. */
export function resetDataStore(): void {
  cached = null;
  initializing = null;
}

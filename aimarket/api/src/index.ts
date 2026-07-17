import type { Server } from 'node:http';
import { writeFileSync, rmSync } from 'node:fs';
import type { Express } from 'express';

import { createApp } from './app.js';
import { createStore } from './data/store.js';
import { buildAiServices } from './ai/services.js';
import { toIndexDocument, ensureSearchIndex } from './ai/search.js';
import { loadSearchConfig } from './ai/config.js';

const PORT_FILE = new URL('../.runtime-port', import.meta.url);

const DEFAULT_PORT = 3000;
const MAX_PORT_PROBES = 20;

/**
 * Listen on `preferredPort`. If it is already in use, try the next ports in
 * sequence, and finally fall back to an OS-assigned ephemeral port (0). This
 * never kills the process holding the preferred port.
 */
function listenOnFreePort(
  app: Express,
  preferredPort: number,
  host: string,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    let attempt = 0;

    const tryListen = (port: number, usingEphemeral: boolean): void => {
      const server = app.listen(port, host);

      server.once('listening', () => {
        const address = server.address();
        const boundPort =
          typeof address === 'object' && address ? address.port : port;
        resolve({ server, port: boundPort });
      });

      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE' && !usingEphemeral) {
          attempt += 1;
          if (attempt <= MAX_PORT_PROBES) {
            console.warn(
              `Port ${port} in use; trying ${port + 1} (leaving the existing process alone).`,
            );
            tryListen(port + 1, false);
          } else {
            console.warn(
              `No free port found near ${preferredPort}; requesting an ephemeral port.`,
            );
            tryListen(0, true);
          }
        } else {
          reject(err);
        }
      });
    };

    tryListen(preferredPort, preferredPort === 0);
  });
}

async function main(): Promise<void> {
  const preferredPort = Number(process.env.PORT ?? DEFAULT_PORT);
  const host = process.env.HOST ?? '0.0.0.0';

  const store = await createStore();
  const ai = await buildAiServices();
  const app = createApp(store, ai);

  // Best-effort: ensure the Azure AI Search index exists, then push all active
  // products so the index is populated without a manual reindex. The index must
  // be created before documents are pushed. Non-fatal if it fails.
  if (ai.search) {
    try {
      await ensureSearchIndex(loadSearchConfig());
      const { data } = await store.products.getAll({ page: 1, pageSize: 10000, status: 'active' });
      const indexed = await ai.search.indexProducts(data.map(toIndexDocument));
      console.log(`Indexed ${indexed} products into Azure AI Search.`);
    } catch (err) {
      console.warn(
        'Startup indexing skipped (Azure AI Search unavailable):',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  const { server, port } = await listenOnFreePort(app, preferredPort, host);
  // Publish the actual bound port so the verifier can discover it without
  // guessing (falls back to API_URL / PORT when this file is absent).
  try {
    writeFileSync(PORT_FILE, String(port), 'utf8');
  } catch {
    /* non-fatal */
  }
  console.log(`AIMarket API listening on http://localhost:${port} (DATA_PROVIDER=${process.env.DATA_PROVIDER || 'sqlite'})`);
  if (port !== preferredPort) {
    console.log(`Note: preferred port ${preferredPort} was unavailable; using ${port} instead.`);
  }

  const shutdown = (signal: string): void => {
    console.log(`Received ${signal}, shutting down...`);
    try {
      rmSync(PORT_FILE, { force: true });
    } catch {
      /* non-fatal */
    }
    server.close(() => {
      store.close?.();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Failed to start AIMarket API:', err);
  process.exit(1);
});

import { PrismaClient } from '@prisma/client';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const serverRoot = fileURLToPath(new URL('../..', import.meta.url));
const schemaPath = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url));

function resolvePrismaCli(): string {
  let dir = serverRoot;
  for (;;) {
    const candidate = join(dir, 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not find node_modules/prisma/build/index.js above ${serverRoot}`);
    }
    dir = parent;
  }
}

/**
 * Some hosts (cPanel's Node.js Selector has done this even after "Run NPM
 * Install" reports success) never actually run the `postinstall` lifecycle
 * script that generates the Prisma Client — `@prisma/client` then ships a
 * stub that throws exactly this message from its constructor. Generating
 * right here, inside the actual running app process, uses the exact same
 * module resolution the app itself relies on, so it doesn't depend on
 * postinstall's separate (and on this host, unreliable) execution context.
 * The regenerated files land on real disk, but this process's module cache
 * already loaded the stub class — an ESM/CJS cache is permanent for the
 * process's lifetime, so a fresh process is required to pick up the real
 * one, hence the deliberate exit-and-let-the-host-restart-us below.
 */
function selfHealAndRestart(): never {
  console.error('[prisma] client not generated yet — generating now inside the running app...');
  execFileSync(process.execPath, [resolvePrismaCli(), 'generate', '--schema', schemaPath], {
    cwd: serverRoot,
    stdio: 'inherit',
  });
  try {
    execFileSync(process.execPath, [resolvePrismaCli(), 'migrate', 'deploy', '--schema', schemaPath], {
      cwd: serverRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[prisma] migrate deploy failed (continuing to restart anyway):', err);
  }
  console.error('[prisma] client generated — exiting so the process manager restarts with a fresh module cache.');
  process.exit(1);
}

function createPrismaClient(): PrismaClient {
  try {
    return new PrismaClient();
  } catch (err) {
    if (err instanceof Error && err.message.includes('did not initialize yet')) {
      selfHealAndRestart();
    }
    throw err;
  }
}

/**
 * Single shared Prisma client for the process. Avoids exhausting MySQL
 * connections from creating a new client per request/module in dev with
 * hot-reload (tsx watch re-executes this module on change).
 */
export const prisma = createPrismaClient();

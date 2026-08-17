// Runs after every `npm install`. On hosts like cPanel's Node.js Selector,
// lifecycle scripts execute with the process's cwd pointed at the venv's
// OWN internal directory (e.g. /home/.../nodevenv/card-game/server/18/lib)
// instead of the actual application root — which breaks any command that
// resolves a path relative to `process.cwd()` (a bare `prisma generate`
// looking for prisma/schema.prisma, `require`/`import` of a relative
// script path, etc). `import.meta.url` is NOT affected by that — it's
// always this file's own real location on disk — so every path here is
// computed from that instead of cwd, and works regardless of where the
// process was launched from.
import { cpSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

const serverRoot = fileURLToPath(new URL('..', import.meta.url));
const sharedSource = fileURLToPath(new URL('../../shared', import.meta.url));
const sharedDest = fileURLToPath(new URL('../node_modules/@card-games/shared', import.meta.url));
const schemaPath = fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url));

// 1. Replace whatever npm left at node_modules/@card-games/shared (often a
//    dangling symlink on hosts like this) with a real, physical copy.
if (existsSync(sharedSource)) {
  rmSync(sharedDest, { recursive: true, force: true });
  cpSync(sharedSource, sharedDest, { recursive: true, dereference: true });
  console.log('postinstall: replaced node_modules/@card-games/shared with a real copy');
} else {
  console.log('postinstall: ../shared not found, skipping (not a workspace checkout)');
}

// 2. Run Prisma without going through `npx` at all. `npx` has to resolve
//    the `prisma` binary via PATH/lookup logic that behaves differently
//    across hosts (and can silently try to fetch it from the registry if
//    it thinks the package isn't installed) — instead, walk up from this
//    file's real directory through every `node_modules` above it (npm
//    workspaces can hoist `prisma` to the monorepo root in local dev, or
//    it can land directly under server/node_modules on a host that
//    installs server/ as a standalone package) and invoke the CLI's own
//    entry file directly with the current Node binary. That also avoids
//    needing a shell (and its quoting rules) just to pass an absolute
//    schema path that might contain spaces.
function resolvePrismaCli() {
  let dir = serverRoot;
  for (;;) {
    const candidate = join(dir, 'node_modules', 'prisma', 'build', 'index.js');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`postinstall: could not find node_modules/prisma/build/index.js above ${serverRoot}`);
    }
    dir = parent;
  }
}

function runPrisma(args) {
  const prismaCli = resolvePrismaCli();
  execFileSync(process.execPath, [prismaCli, ...args, '--schema', schemaPath], {
    cwd: serverRoot,
    stdio: 'inherit',
  });
}

runPrisma(['generate']);
runPrisma(['migrate', 'deploy']);

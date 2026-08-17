import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * A plain source-text guard, not a behavioral test: `localServer.ts` (the
 * phone-as-host composition root) must stay usable with zero database at
 * all — see the Android app plan's Area C. If anyone ever imports
 * `@prisma/client`, `db/prisma.js`, or `config/env.js` back into this file
 * (even transitively through a new local-only helper added here), that
 * guarantee silently breaks. This fails loudly instead.
 */
describe('localServer.ts stays database-free', () => {
  it('never references @prisma/client, db/prisma, or config/env', () => {
    const path = fileURLToPath(new URL('./localServer.ts', import.meta.url));
    const source = readFileSync(path, 'utf-8');

    // Matches real import/require statements only — not this file's own
    // explanatory prose, which legitimately names these paths in English.
    expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
    expect(source).not.toMatch(/from\s+['"].*db\/prisma\.js['"]/);
    expect(source).not.toMatch(/from\s+['"].*config\/env\.js['"]/);
  });

  it('localIndex.ts (the runnable entrypoint) is equally database-free', () => {
    const path = fileURLToPath(new URL('./localIndex.ts', import.meta.url));
    const source = readFileSync(path, 'utf-8');

    // Matches real import/require statements only — not this file's own
    // explanatory prose, which legitimately names these paths in English.
    expect(source).not.toMatch(/from\s+['"]@prisma\/client['"]/);
    expect(source).not.toMatch(/from\s+['"].*db\/prisma\.js['"]/);
    expect(source).not.toMatch(/from\s+['"].*config\/env\.js['"]/);
  });
});

import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import * as path from 'node:path';

const require = createRequire(import.meta.url);

describe('ponytail-mcp launcher dependencies', () => {
  it('resolves ponytail instruction hooks from the bundled package', () => {
    const ponytailEntry = require.resolve('@dietrichgebert/ponytail');
    const ponytailRoot = path.resolve(path.dirname(ponytailEntry), '../..');
    const { getPonytailInstructions } = require(path.join(ponytailRoot, 'hooks/ponytail-instructions.js')) as {
      getPonytailInstructions: (mode?: string) => string;
    };

    const instructions = getPonytailInstructions('lite');
    expect(instructions).toContain('PONYTAIL MODE ACTIVE');
    expect(instructions.length).toBeGreaterThan(100);
  });
});

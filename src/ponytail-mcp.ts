#!/usr/bin/env node

/**
 * Ponytail MCP server bundled with StackGuide.
 * Serves lazy-senior-dev instructions on demand to save tokens vs always-on rules.
 */

import { createRequire } from 'node:module';
import * as path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const require = createRequire(import.meta.url);

const ponytailEntry = require.resolve('@dietrichgebert/ponytail');
const ponytailRoot = path.resolve(path.dirname(ponytailEntry), '../..');
const { getPonytailInstructions } = require(path.join(ponytailRoot, 'hooks/ponytail-instructions.js')) as {
  getPonytailInstructions: (mode?: string) => string;
};
const { getDefaultMode, normalizeMode } = require(path.join(ponytailRoot, 'hooks/ponytail-config.js')) as {
  getDefaultMode: () => string;
  normalizeMode: (mode?: string) => string | null;
};

const MODES = ['lite', 'full', 'ultra'] as const;

function resolveMode(requested?: string): string {
  const asked = normalizeMode(requested);
  if (asked && asked !== 'off') {
    return asked;
  }

  const fallback = normalizeMode(getDefaultMode());
  return fallback && fallback !== 'off' ? fallback : 'lite';
}

function buildInstructions(requested?: string): string {
  return getPonytailInstructions(resolveMode(requested));
}

const modeArg = z
  .enum(MODES)
  .optional()
  .describe('Ponytail intensity: lite, full, or ultra. Omit for the configured default.');

const server = new McpServer({ name: 'ponytail', version: '1.0.0' });

server.registerPrompt(
  'ponytail',
  {
    title: 'Ponytail mode',
    description: 'Lazy senior dev instructions: YAGNI, stdlib first, the smallest correct change.',
    argsSchema: { mode: modeArg },
  },
  ({ mode }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: buildInstructions(mode) } }],
  }),
);

server.registerTool(
  'ponytail_instructions',
  {
    title: 'Ponytail instructions',
    description: 'Return the Ponytail ruleset for the given intensity (lite, full, or ultra).',
    inputSchema: { mode: modeArg },
    outputSchema: { mode: z.string(), instructions: z.string() },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  ({ mode }) => {
    const resolvedMode = resolveMode(mode);
    const instructions = buildInstructions(resolvedMode);
    return {
      content: [{ type: 'text', text: instructions }],
      structuredContent: { mode: resolvedMode, instructions },
    };
  },
);

await server.connect(new StdioServerTransport());

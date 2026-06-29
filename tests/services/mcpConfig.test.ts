import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  CORE_MCP_INTEGRATIONS,
  previewMcpTemplateSync,
  resolveMcpIntegrations,
  syncMcpTemplateConfigs,
} from '../../src/services/mcpConfig.js';

describe('mcpConfig service', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stackguide-mcp-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('always includes ponytail in resolved integrations', () => {
    expect(resolveMcpIntegrations([])).toEqual(['ponytail']);
    expect(resolveMcpIntegrations(['github'])).toEqual(['ponytail', 'github']);
    expect(CORE_MCP_INTEGRATIONS).toEqual(['ponytail']);
  });

  it('previews additions for both manifest targets including ponytail core', () => {
    const preview = previewMcpTemplateSync(tmpDir, ['jira', 'github'], ['cursor', 'root']);

    expect(preview.integrations).toEqual(['ponytail', 'jira', 'github']);
    expect(preview.coreIntegrations).toEqual(['ponytail']);
    expect(preview.targets.length).toBe(2);
    expect(preview.targets[0].addedServers).toContain('ponytail');
    expect(preview.targets[0].addedServers).toContain('atlassian');
    expect(preview.placeholders).toEqual([]);
  });

  it('syncs ponytail core and optional integrations into manifests', () => {
    const result = syncMcpTemplateConfigs(tmpDir, ['jira', 'gitlab'], ['cursor', 'root']);

    expect(result.targets).toHaveLength(2);
    const cursorPath = path.join(tmpDir, '.cursor', 'mcp.json');
    const rootPath = path.join(tmpDir, '.mcp.json');

    expect(fs.existsSync(cursorPath)).toBe(true);
    expect(fs.existsSync(rootPath)).toBe(true);

    const cursorManifest = JSON.parse(fs.readFileSync(cursorPath, 'utf-8')) as { mcpServers: Record<string, unknown> };
    const rootManifest = JSON.parse(fs.readFileSync(rootPath, 'utf-8')) as { mcpServers: Record<string, unknown> };

    expect(Object.keys(cursorManifest.mcpServers)).toContain('ponytail');
    expect(Object.keys(cursorManifest.mcpServers)).toContain('atlassian');
    expect(Object.keys(rootManifest.mcpServers)).toContain('gitlab');
    expect(Object.keys(rootManifest.mcpServers)).toContain('ponytail');

    const ponytailConfig = cursorManifest.mcpServers.ponytail as {
      command: string;
      args: string[];
      env: { PONYTAIL_DEFAULT_MODE: string };
    };
    expect(ponytailConfig.command).toBe('npx');
    expect(ponytailConfig.args).toContain('stackguide-ponytail-mcp');
    expect(ponytailConfig.env.PONYTAIL_DEFAULT_MODE).toBe('lite');
  });

  it('does not overwrite existing server definitions', () => {
    const rootPath = path.join(tmpDir, '.mcp.json');
    fs.writeFileSync(rootPath, JSON.stringify({
      mcpServers: {
        atlassian: {
          url: 'https://custom.atlassian.example/mcp',
        },
      },
    }, null, 2));

    const result = syncMcpTemplateConfigs(tmpDir, ['jira'], ['root']);
    const manifest = JSON.parse(fs.readFileSync(rootPath, 'utf-8')) as {
      mcpServers: Record<string, { url?: string }>;
    };

    expect(result.targets[0].addedServers).toContain('ponytail');
    expect(result.targets[0].skippedServers).toContain('atlassian');
    expect(manifest.mcpServers.atlassian.url).toBe('https://custom.atlassian.example/mcp');
  });
});

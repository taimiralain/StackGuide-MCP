/**
 * Agent config helpers for the active workflow.
 * Generates and reads `.stackguide/config.json`.
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'node:child_process';
import { logger } from '../utils/logger.js';

export type TrackerType = 'github' | 'gitlab' | 'jira' | 'none';
export type VcsType = 'github' | 'gitlab' | 'git';
export type DetectionConfidence = 'high' | 'medium' | 'low' | 'manual' | 'unknown';
export type TddTokenMode = 'compact' | 'balanced' | 'verbose';
export type McpIntegration = 'ponytail' | 'jira' | 'github' | 'gitlab';
export type McpManifestTarget = 'cursor' | 'root';

export interface TrackerConfig {
  type: TrackerType;
  tokenEnv?: string;
  owner?: string;
  repo?: string;
  projectId?: string;
  baseUrl?: string;
  projectKey?: string;
  defaultIssueType?: string;
}

export interface VcsConfig {
  type: VcsType;
  tokenEnv?: string;
  owner?: string;
  repo?: string;
  projectId?: string;
  defaultBranch: string;
  branchPattern: string;
  /** Preferred ref for merge-base when counting branch diff (verify TDD budget). */
  mergeBaseBranch?: string;
}

export interface LayerCommands {
  test?: string;
  lint?: string;
  build?: string;
  typecheck?: string;
}

export interface TestingLayerConfig {
  dir: string;
  enabled: boolean;
  commands: LayerCommands;
}

export interface TestingConfig {
  backend?: TestingLayerConfig;
  frontend?: TestingLayerConfig;
}

export interface WorkflowConfig {
  testBudget: number;
  commitConvention: 'conventional' | 'none';
  requireTicketInBranch: boolean;
  /** Git ref for verify merge-base (e.g. development). Falls back to defaultBranch. */
  verifyBaseBranch?: string;
  /** When true, Implementer prompt forbids git commit until verify passes. */
  implementerLeavesChangesUncommitted?: boolean;
}

export interface TddAutomationConfig {
  preferredModel: string;
  tokenMode: TddTokenMode;
}

export interface JiraAutomationConfig {
  issueType: string;
  summarySource: 'first_line_main_description';
  descriptionField: 'description';
  strictTemplate: boolean;
}

export interface McpAutomationConfig {
  integrations: McpIntegration[];
  syncTargets: McpManifestTarget[];
}

export interface AutomationConfig {
  tdd: TddAutomationConfig;
  jira: JiraAutomationConfig;
  mcp: McpAutomationConfig;
}

export interface AgentProjectConfig {
  version: 1;
  tracker: TrackerConfig;
  vcs: VcsConfig;
  testing: TestingConfig;
  workflow: WorkflowConfig;
  automation: AutomationConfig;
  metadata: {
    generatedAt: string;
    projectType: string | null;
    detectionConfidence: DetectionConfidence;
    source: 'auto' | 'manual';
  };
}

export interface AgentConfigOverrides {
  model?: string;
  tokenMode?: TddTokenMode;
  mcpIntegrations?: McpIntegration[];
  mcpSyncTargets?: McpManifestTarget[];
  jiraProjectKey?: string;
  jiraIssueType?: string;
}

interface RemoteInfo {
  provider: 'github' | 'gitlab' | 'unknown';
  owner?: string;
  repo?: string;
  projectId?: string;
}

interface ProjectDetectionContext {
  projectType: string | null;
  confidence: DetectionConfidence;
  source: 'auto' | 'manual';
}

const STACKGUIDE_DIR = '.stackguide';
const CONFIG_FILE = 'config.json';
const DEFAULT_BRANCH_PATTERN = 'feature/<TICKET>-<slug>';
const DEFAULT_MODEL = 'model-auto';
const DEFAULT_TOKEN_MODE: TddTokenMode = 'compact';
const DEFAULT_MCP_TARGETS: McpManifestTarget[] = ['cursor', 'root'];
const DEFAULT_MCP_INTEGRATIONS: McpIntegration[] = ['ponytail'];

function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function runGit(projectPath: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd: projectPath,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
}

function detectGitRemote(projectPath: string): RemoteInfo {
  try {
    const originUrl = runGit(projectPath, ['remote', 'get-url', 'origin']);

    const githubMatch = originUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (githubMatch) {
      return {
        provider: 'github',
        owner: githubMatch[1],
        repo: githubMatch[2],
      };
    }

    const gitlabMatch = originUrl.match(/gitlab\.com[:/]([^ ]+?)(?:\.git)?$/i);
    if (gitlabMatch) {
      const projectPathParts = gitlabMatch[1].split('/').filter(Boolean);
      const repo = projectPathParts[projectPathParts.length - 1];
      const owner = projectPathParts[0];
      return {
        provider: 'gitlab',
        owner,
        repo,
        projectId: projectPathParts.join('/'),
      };
    }
  } catch {
    // Not a git repository or no remote configured.
  }

  return { provider: 'unknown' };
}

function detectDefaultBranch(projectPath: string): string {
  try {
    const remoteHead = runGit(projectPath, ['symbolic-ref', 'refs/remotes/origin/HEAD']);
    const parts = remoteHead.split('/');
    const branch = parts[parts.length - 1];
    if (branch) {
      return branch;
    }
  } catch {
    // Ignore and fallback.
  }

  try {
    const current = runGit(projectPath, ['branch', '--show-current']);
    if (current) {
      return current;
    }
  } catch {
    // Ignore and fallback.
  }

  return 'main';
}

function normalizeMcpIntegration(value: string): McpIntegration | null {
  if (value === 'ponytail' || value === 'jira' || value === 'github' || value === 'gitlab') {
    return value;
  }
  return null;
}

function normalizeMcpTarget(value: string): McpManifestTarget | null {
  if (value === 'cursor' || value === 'root') {
    return value;
  }
  return null;
}

function getMcpServers(projectPath: string): Record<string, unknown> {
  const manifests = [
    path.join(projectPath, '.mcp.json'),
    path.join(projectPath, '.cursor', 'mcp.json'),
  ];

  const merged: Record<string, unknown> = {};
  for (const manifestPath of manifests) {
    const mcpData = readJsonSafe<{ mcpServers?: Record<string, unknown> }>(manifestPath);
    if (mcpData?.mcpServers) {
      Object.assign(merged, mcpData.mcpServers);
    }
  }

  return merged;
}

function detectJiraFromMcpConfig(projectPath: string): Partial<TrackerConfig> | null {
  const mcpServers = getMcpServers(projectPath);
  if (Object.keys(mcpServers).length === 0) {
    return null;
  }

  for (const [name, serverRaw] of Object.entries(mcpServers)) {
    const normalizedName = name.toLowerCase();
    if (!normalizedName.includes('jira') && !normalizedName.includes('atlassian')) {
      continue;
    }

    const server = typeof serverRaw === 'object' && serverRaw !== null
      ? serverRaw as Record<string, unknown>
      : {};

    let baseUrl: string | undefined;
    const env = (server.env && typeof server.env === 'object')
      ? server.env as Record<string, unknown>
      : undefined;

    if (env && typeof env.JIRA_BASE_URL === 'string') {
      baseUrl = env.JIRA_BASE_URL;
    }

    return {
      type: 'jira',
      tokenEnv: 'JIRA_TOKEN',
      baseUrl,
    };
  }

  return null;
}

function normalizeRelativeDir(projectPath: string, dirPath: string): string {
  const relative = path.relative(projectPath, dirPath);
  if (!relative) {
    return '.';
  }
  return relative.split(path.sep).join('/');
}

function detectNodeLayer(projectPath: string, dirPath: string): TestingLayerConfig | null {
  const packageJsonPath = path.join(dirPath, 'package.json');
  const packageData = readJsonSafe<{ scripts?: Record<string, string> }>(packageJsonPath);
  if (!packageData?.scripts) {
    return null;
  }

  const commands: LayerCommands = {};
  if (packageData.scripts.test) {
    commands.test = 'pnpm test';
  }
  if (packageData.scripts.lint) {
    commands.lint = 'pnpm lint';
  }
  if (packageData.scripts.build) {
    commands.build = 'pnpm build';
  }
  if (packageData.scripts.typecheck) {
    commands.typecheck = 'pnpm typecheck';
  }

  if (Object.keys(commands).length === 0) {
    return null;
  }

  return {
    dir: normalizeRelativeDir(projectPath, dirPath),
    enabled: true,
    commands,
  };
}

function detectPhpLayer(projectPath: string, dirPath: string): TestingLayerConfig | null {
  const composerJsonPath = path.join(dirPath, 'composer.json');
  if (!fs.existsSync(composerJsonPath)) {
    return null;
  }

  const composerData = readJsonSafe<{ scripts?: Record<string, unknown> }>(composerJsonPath);
  const commands: LayerCommands = {};

  const scripts = composerData?.scripts || {};
  if (scripts.test) {
    commands.test = 'composer run test';
  } else if (fs.existsSync(path.join(dirPath, 'artisan'))) {
    commands.test = 'php artisan test --parallel';
  }

  if (scripts.lint) {
    commands.lint = 'composer run lint';
  } else if (fs.existsSync(path.join(dirPath, 'vendor/bin/pint'))) {
    commands.lint = './vendor/bin/pint --test';
  }

  if (Object.keys(commands).length === 0) {
    return null;
  }

  return {
    dir: normalizeRelativeDir(projectPath, dirPath),
    enabled: true,
    commands,
  };
}

function detectTestingConfig(projectPath: string): TestingConfig {
  const backendDir = path.join(projectPath, 'backend');
  const frontendDir = path.join(projectPath, 'frontend');

  let backend = detectPhpLayer(projectPath, backendDir) || detectNodeLayer(projectPath, backendDir);
  let frontend = detectNodeLayer(projectPath, frontendDir);

  if (!backend && !frontend) {
    // Single-project layout fallback from root.
    backend = detectPhpLayer(projectPath, projectPath);
    if (!backend) {
      frontend = detectNodeLayer(projectPath, projectPath);
    }
  }

  return {
    ...(backend ? { backend } : {}),
    ...(frontend ? { frontend } : {}),
  };
}

function buildAutomationConfig(overrides: AgentConfigOverrides = {}): AutomationConfig {
  const integrations = (overrides.mcpIntegrations || [])
    .map(normalizeMcpIntegration)
    .filter((integration): integration is McpIntegration => integration !== null);

  const mergedIntegrations = new Set<McpIntegration>([...DEFAULT_MCP_INTEGRATIONS]);
  for (const integration of integrations) {
    mergedIntegrations.add(integration);
  }

  const syncTargets = (overrides.mcpSyncTargets || DEFAULT_MCP_TARGETS)
    .map(normalizeMcpTarget)
    .filter((target): target is McpManifestTarget => target !== null);

  return {
    tdd: {
      preferredModel: (overrides.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL,
      tokenMode: overrides.tokenMode || DEFAULT_TOKEN_MODE,
    },
    jira: {
      issueType: (overrides.jiraIssueType || 'Task').trim() || 'Task',
      summarySource: 'first_line_main_description',
      descriptionField: 'description',
      strictTemplate: true,
    },
    mcp: {
      integrations: Array.from(mergedIntegrations.values()),
      syncTargets: syncTargets.length > 0 ? syncTargets : [...DEFAULT_MCP_TARGETS],
    },
  };
}

function buildVcsConfig(projectPath: string, remote: RemoteInfo): VcsConfig {
  const defaultBranch = detectDefaultBranch(projectPath);

  if (remote.provider === 'github') {
    return {
      type: 'github',
      owner: remote.owner,
      repo: remote.repo,
      tokenEnv: 'GITHUB_TOKEN',
      defaultBranch,
      branchPattern: DEFAULT_BRANCH_PATTERN,
    };
  }

  if (remote.provider === 'gitlab') {
    return {
      type: 'gitlab',
      projectId: remote.projectId,
      owner: remote.owner,
      repo: remote.repo,
      tokenEnv: 'GITLAB_TOKEN',
      defaultBranch,
      branchPattern: DEFAULT_BRANCH_PATTERN,
    };
  }

  return {
    type: 'git',
    defaultBranch,
    branchPattern: DEFAULT_BRANCH_PATTERN,
  };
}

function buildTrackerConfig(
  projectPath: string,
  remote: RemoteInfo,
  overrides: AgentConfigOverrides = {}
): TrackerConfig {
  const jiraConfig = detectJiraFromMcpConfig(projectPath);
  const issueType = (overrides.jiraIssueType || 'Task').trim() || 'Task';
  if (jiraConfig?.type === 'jira') {
    return {
      type: 'jira',
      tokenEnv: jiraConfig.tokenEnv || 'JIRA_TOKEN',
      baseUrl: jiraConfig.baseUrl,
      projectKey: overrides.jiraProjectKey || jiraConfig.projectKey,
      defaultIssueType: issueType,
    };
  }

  if (remote.provider === 'github') {
    return {
      type: 'github',
      owner: remote.owner,
      repo: remote.repo,
      tokenEnv: 'GITHUB_TOKEN',
      defaultIssueType: issueType,
    };
  }

  if (remote.provider === 'gitlab') {
    return {
      type: 'gitlab',
      projectId: remote.projectId,
      owner: remote.owner,
      repo: remote.repo,
      tokenEnv: 'GITLAB_TOKEN',
      defaultIssueType: issueType,
    };
  }

  return { type: 'none', defaultIssueType: issueType };
}

export function getAgentConfigPath(projectPath: string): string {
  return path.join(projectPath, STACKGUIDE_DIR, CONFIG_FILE);
}

function withConfigDefaults(config: AgentProjectConfig): AgentProjectConfig {
  const automation = buildAutomationConfig({
    model: config.automation?.tdd?.preferredModel,
    tokenMode: config.automation?.tdd?.tokenMode,
    mcpIntegrations: config.automation?.mcp?.integrations,
    mcpSyncTargets: config.automation?.mcp?.syncTargets,
    jiraIssueType: config.automation?.jira?.issueType || config.tracker.defaultIssueType,
    jiraProjectKey: config.tracker.projectKey,
  });

  const mergeBaseBranch = config.workflow.verifyBaseBranch || config.vcs.mergeBaseBranch;

  return {
    ...config,
    tracker: {
      ...config.tracker,
      defaultIssueType: config.tracker.defaultIssueType || automation.jira.issueType,
    },
    vcs: {
      ...config.vcs,
      mergeBaseBranch,
    },
    automation,
  };
}

export function readAgentProjectConfig(projectPath: string): AgentProjectConfig | null {
  const configPath = getAgentConfigPath(projectPath);
  const data = readJsonSafe<AgentProjectConfig>(configPath);

  if (!data || typeof data !== 'object') {
    return null;
  }

  if (!data.tracker || !data.vcs || !data.workflow || !data.testing) {
    return null;
  }

  return withConfigDefaults(data);
}

export function writeAgentProjectConfig(projectPath: string, config: AgentProjectConfig): string {
  const configPath = getAgentConfigPath(projectPath);
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  return configPath;
}

export function generateAgentProjectConfig(
  projectPath: string,
  detection: ProjectDetectionContext,
  overrides: AgentConfigOverrides = {}
): AgentProjectConfig {
  const remote = detectGitRemote(projectPath);
  const automation = buildAutomationConfig(overrides);

  const config: AgentProjectConfig = {
    version: 1,
    tracker: buildTrackerConfig(projectPath, remote, overrides),
    vcs: buildVcsConfig(projectPath, remote),
    testing: detectTestingConfig(projectPath),
    workflow: {
      testBudget: 3,
      commitConvention: 'conventional',
      requireTicketInBranch: true,
    },
    automation,
    metadata: {
      generatedAt: new Date().toISOString(),
      projectType: detection.projectType,
      detectionConfidence: detection.confidence,
      source: detection.source,
    },
  };

  logger.debug('Generated agent config', {
    projectPath,
    tracker: config.tracker.type,
    vcs: config.vcs.type,
    model: config.automation.tdd.preferredModel,
    tokenMode: config.automation.tdd.tokenMode,
    hasBackend: !!config.testing.backend,
    hasFrontend: !!config.testing.frontend,
  });

  return config;
}

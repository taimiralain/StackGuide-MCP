#!/usr/bin/env node

/**
 * StackGuide MCP Server v4.2.0
 * 
 * A Model Context Protocol server for dynamic language and framework context loading.
 * Compatible with Cursor and GitHub Copilot.
 * 
 * Architecture:
 * - src/handlers/       - Tool handlers (setup, rules, review, etc.)
 * - src/tools/          - Tool definitions (JSON schemas)
 * - src/utils/          - Utilities (logger, validation)
 * - src/services/       - External services (cursorDirectory, webDocs, httpClient, projectFs)
 * - src/resources/      - Data providers (rules, knowledge)
 * - src/config/         - Configuration and persistence
 * - src/storage/        - SQLite persistence layer
 * - src/router/         - Handler registry pattern
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { ProjectType, SUPPORTED_PROJECTS } from './config/types.js';
import * as persistence from './config/persistence.js';
import * as rulesProvider from './resources/rulesProvider.js';
import * as knowledgeProvider from './resources/knowledgeProvider.js';

import { toolDefinitions } from './tools/definitions.js';
import {
  handleSetup,
  handleContext,
  handleRules,
  handleKnowledge,
  handleReview,
  handleCursor,
  handleDocs,
  handleConfig,
  handleCustomRule,
  handleHelp,
  handleGenerate,
  handleHealth,
  handleAnalyze,
  handleWorkflow,
  handleInit,
  handleAgent,
  ServerState,
  textResponse
} from './handlers/index.js';
import { listAllResources, handleResourceRead } from './handlers/resources.js';
import { listAllPrompts, handlePrompt } from './handlers/prompts.js';
import { createToolRouter } from './router/index.js';
import { logger } from './utils/logger.js';

// ==================== SERVER STATE ====================

const serverState: ServerState = {
  activeProjectType: null,
  activeConfiguration: null,
  loadedRules: [],
  loadedKnowledge: []
};

// ==================== CREATE SERVER ====================

const server = new Server(
  {
    name: 'stackguide-mcp',
    version: '4.2.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);

// ==================== TOOL ROUTER ====================

const toolRouter = createToolRouter()
  .register('setup', handleSetup)
  .register('context', handleContext)
  .register('rules', handleRules)
  .register('knowledge', handleKnowledge)
  .register('review', handleReview)
  .register('cursor', handleCursor)
  .register('docs', handleDocs)
  .register('config', handleConfig)
  .register('custom_rule', handleCustomRule)
  .register('help', handleHelp)
  .register('generate', handleGenerate)
  .register('health', handleHealth)
  .register('analyze', handleAnalyze)
  .register('workflow', handleWorkflow)
  .register('init', handleInit)
  .register('agent', handleAgent);

// ==================== TOOLS ====================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools: toolDefinitions };
});

server.setRequestHandler(CallToolRequestSchema, async (request): Promise<{ content: Array<{ type: 'text'; text: string }> }> => {
  const { name, arguments: args = {} } = request.params;
  return toolRouter.handle(name, args, serverState);
});

// ==================== RESOURCES ====================

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return { resources: listAllResources() };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;
  try {
    return handleResourceRead(uri, serverState) as any;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      contents: [{ uri, mimeType: 'text/plain', text: `Error reading resource: ${message}` }]
    };
  }
});

// ==================== PROMPTS ====================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return { prompts: listAllPrompts() };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name, arguments: promptArgs } = request.params;
  return handlePrompt(name, promptArgs || {}, serverState) as any;
});

// ==================== MAIN ====================

async function main() {
  logger.info('Starting StackGuide MCP Server');

  // Load active configuration if exists
  const activeConfig = persistence.getActiveConfiguration();
  if (activeConfig) {
    serverState.activeConfiguration = activeConfig;
    serverState.activeProjectType = activeConfig.projectType;
    serverState.loadedRules = rulesProvider.getRulesForProject(activeConfig.projectType);
    serverState.loadedKnowledge = knowledgeProvider.getKnowledgeForProject(activeConfig.projectType);
    logger.info('Loaded saved configuration', { projectType: activeConfig.projectType });
  }

  // Start STDIO transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('StackGuide MCP Server started');
}

main().catch((error) => {
  logger.error('Fatal error', { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});

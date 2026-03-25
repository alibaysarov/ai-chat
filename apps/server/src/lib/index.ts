export * from './db';
export * from './ai-client';
export * from './n8n-mcp-client';
export * from './zapier-mcp-client';

import { env } from '../env';
import { ZapierMcpClient } from './zapier-mcp-client';

export const zapierMcpClient: ZapierMcpClient | null =
  env.ZAPIER_MCP_URL && env.ZAPIER_MCP_API_KEY
    ? new ZapierMcpClient(env.ZAPIER_MCP_URL, env.ZAPIER_MCP_API_KEY)
    : null;

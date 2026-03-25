import { env } from '../env';
import type { McpTool, McpToolParameter, McpToolParameterType } from '@ai-chat/shared';

interface McpRawToolProperty {
  type: string;
  description: string;
}

interface McpRawTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, McpRawToolProperty>;
    required?: string[];
  };
}

interface McpListToolsResponse {
  result: { tools: McpRawTool[] };
}

interface McpCallToolContent {
  type: string;
  text: string;
}

interface McpCallToolResponse {
  result?: {
    content: McpCallToolContent[];
    isError?: boolean;
  };
  error?: { message: string };
}

export interface OpenAiToolFunction {
  type: 'function';
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required: string[];
    additionalProperties: boolean;
  };
}

export class N8nMcpClient {
  private toolCache: McpTool[] | null = null;

  constructor(
    private readonly url: string,
    private readonly apiKey: string,
  ) {}

  private async post<T>(body: unknown): Promise<T> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`n8n MCP HTTP error ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async listTools(): Promise<McpTool[]> {
    if (this.toolCache) return this.toolCache;
    const data = await this.post<McpListToolsResponse>({
      jsonrpc: '2.0',
      method: 'tools/list',
      id: 1,
    });
    this.toolCache = data.result.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: Object.fromEntries(
        Object.entries(t.inputSchema.properties ?? {}).map(([k, v]) => [
          k,
          {
            type: v.type as McpToolParameterType,
            description: v.description,
          },
        ]),
      ),
      requiredParams: t.inputSchema.required ?? [],
    }));
    return this.toolCache;
  }

  invalidateCache(): void {
    this.toolCache = null;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const data = await this.post<McpCallToolResponse>({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id: 2,
    });
    if (data.error) throw new Error(data.error.message);
    if (!data.result) throw new Error('Empty response from n8n MCP');
    if (data.result.isError) {
      throw new Error(data.result.content[0]?.text ?? 'Tool returned an error');
    }
    return data.result.content.map((c) => c.text).join('\n');
  }

  async toOpenAiTools(): Promise<OpenAiToolFunction[]> {
    const tools = await this.listTools();
    return tools.map((t) => {
      const props: Record<string, { type: string; description: string }> = {};
      for (const [k, v] of Object.entries(t.parameters)) {
        const param = v as McpToolParameter;
        props[k] = { type: param.type, description: param.description };
      }
      return {
        type: 'function' as const,
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object' as const,
          properties: props,
          required: t.requiredParams,
          additionalProperties: false,
        },
      };
    });
  }
}

export const n8nMcpClient: N8nMcpClient | null =
  env.N8N_MCP_URL && env.N8N_MCP_API_KEY
    ? new N8nMcpClient(env.N8N_MCP_URL, env.N8N_MCP_API_KEY)
    : null;

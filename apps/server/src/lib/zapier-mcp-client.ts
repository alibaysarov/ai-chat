import type { McpTool, McpToolParameter, McpToolParameterType } from '@ai-chat/shared';
import type { OpenAiToolFunction } from './n8n-mcp-client';

interface ZapierRawToolProperty {
  type: string;
  description: string;
}

interface ZapierRawTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, ZapierRawToolProperty>;
    required?: string[];
  };
}

interface ZapierListToolsResponse {
  result: { tools: ZapierRawTool[] };
}

interface ZapierCallToolContent {
  type: string;
  text: string;
}

interface ZapierCallToolResponse {
  result?: {
    content: ZapierCallToolContent[];
    isError?: boolean;
  };
  error?: { message: string };
}

export class ZapierMcpClient {
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
      throw new Error(`Zapier MCP HTTP error ${res.status}: ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  async listTools(): Promise<McpTool[]> {
    if (this.toolCache) return this.toolCache;
    const data = await this.post<ZapierListToolsResponse>({
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
          { type: v.type as McpToolParameterType, description: v.description },
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
    const data = await this.post<ZapierCallToolResponse>({
      jsonrpc: '2.0',
      method: 'tools/call',
      params: { name, arguments: args },
      id: 2,
    });
    if (data.error) throw new Error(data.error.message);
    if (!data.result) throw new Error('Empty response from Zapier MCP');
    if (data.result.isError) {
      throw new Error(data.result.content[0]?.text ?? 'Zapier tool returned an error');
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

export type McpToolParameterType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface McpToolParameter {
  type: McpToolParameterType;
  description: string;
}

export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, McpToolParameter>;
  requiredParams: string[];
}

/** Identifies which MCP provider executed a tool call */
export type McpProvider = 'n8n' | 'zapier';

/** WS message sent to client when the LLM invokes a tool */
export interface WsToolCallEvent {
  type: 'chat:tool_call';
  toolName: string;
  args: Record<string, unknown>;
  messageId: string;
  provider: McpProvider;
}

/** WS message sent to client when tool result is ready */
export interface WsToolResultEvent {
  type: 'chat:tool_result';
  toolName: string;
  result: string;
  ok: boolean;
  messageId: string;
  provider: McpProvider;
}

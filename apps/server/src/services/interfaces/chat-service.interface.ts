import type { Result, ChatMessage, McpProvider } from '@ai-chat/shared';

export interface StreamChatRequest {
  conversationId: string;
  content: string;
  fileId?: string;
  signal?: AbortSignal;
  onChunk: (content: string) => void;
  onToolCall?: (toolName: string, args: Record<string, unknown>, messageId: string, provider: McpProvider) => void;
  onToolResult?: (toolName: string, result: string, ok: boolean, messageId: string, provider: McpProvider) => void;
}

export interface StreamChatResponse {
  assistantMessage: ChatMessage;
}

export interface ChatServiceError {
  code: string;
  message: string;
}

export interface IChatService {
  streamChatResponse(
    request: StreamChatRequest,
  ): Promise<Result<StreamChatResponse, ChatServiceError>>;
}

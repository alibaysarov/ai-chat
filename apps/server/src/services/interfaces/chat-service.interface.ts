import type { Result, ChatMessage } from '@ai-chat/shared';

export interface StreamChatRequest {
  conversationId: string;
  content: string;
  fileId?: string;
  signal?: AbortSignal;
  onChunk: (content: string) => void;
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

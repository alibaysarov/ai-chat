export type MessageRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
	id: string;
	role: MessageRole;
	content: string;
	createdAt: Date;
}

export interface ChatCompletionRequest {
	conversationId: string;
	userMessage: string;
}

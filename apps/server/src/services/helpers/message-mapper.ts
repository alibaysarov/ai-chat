import type { EasyInputMessage } from 'openai/resources/responses/responses';
import type { ChatMessage } from '@ai-chat/shared';

export function toInputMessage(message: ChatMessage): EasyInputMessage {
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  return { role, content: message.content };
}

import OpenAI from 'openai';
import { AbortError } from 'p-retry';
import type { ChatServiceError } from '../interfaces/chat-service.interface';

export function mapServiceError(error: unknown): ChatServiceError {
  if (error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
    return { code: 'CHAT_ABORTED', message: 'Generation was cancelled.' };
  }

  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return {
        code: 'RATE_LIMITED',
        message: 'The AI provider is rate limited right now. Please try again shortly.',
      };
    }

    if (typeof error.status === 'number' && error.status >= 500) {
      return {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The AI provider is temporarily unavailable. Please retry in a moment.',
      };
    }
  }

  return {
    code: 'CHAT_STREAM_FAILED',
    message: 'Unable to generate a response right now.',
  };
}

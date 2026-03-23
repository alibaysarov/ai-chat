import OpenAI from 'openai';
import type { EasyInputMessage } from 'openai/resources/responses/responses';
import pRetry, { AbortError } from 'p-retry';
import {
  MAX_CONTEXT_TOKENS,
  err,
  ok,
  type ChatMessage,
  type Result,
} from '@ai-chat/shared';
import { aiClient } from '../lib/ai-client';
import { db } from '../lib/db';
import { buildChatSystemPrompt } from '../prompts/chat-system';

const CHAT_MODEL = 'gpt-4o-mini';
const MAX_RETRY_ATTEMPTS = 3;
const AVG_CHARS_PER_TOKEN = 4;

export interface StreamChatRequest {
  conversationId: string;
  content: string;
  signal?: AbortSignal;
  onChunk: (content: string) => void;
}

export interface ChatServiceError {
  code: string;
  message: string;
}

export interface StreamChatResponse {
  assistantMessage: ChatMessage;
}

interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

function trimHistoryToWindow(
  history: ChatMessage[],
  systemPrompt: string,
  userMessage: string,
): ChatMessage[] {
  const baseTokens = estimateTokens(systemPrompt) + estimateTokens(userMessage);
  const remainingBudget = MAX_CONTEXT_TOKENS - baseTokens;

  if (remainingBudget <= 0) {
    return [];
  }

  const selected: ChatMessage[] = [];
  let usedTokens = 0;

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const message = history[i];
    const messageTokens = estimateTokens(message.content);
    if (usedTokens + messageTokens > remainingBudget) {
      break;
    }

    selected.unshift(message);
    usedTokens += messageTokens;
  }

  return selected;
}

function toInputMessage(message: ChatMessage): EasyInputMessage {
  const role = message.role === 'assistant' ? 'assistant' : 'user';
  return { role, content: message.content };
}

function mapServiceError(error: unknown): ChatServiceError {
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

export async function streamChatResponse(
  request: StreamChatRequest,
): Promise<Result<StreamChatResponse, ChatServiceError>> {
  try {
    const conversation = await db.conversation.upsert({
      where: { id: request.conversationId },
      update: {},
      create: { id: request.conversationId },
    });

    const historyMessages = await db.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });

    await db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: request.content,
      },
    });

    const systemPrompt = buildChatSystemPrompt();
    const history = trimHistoryToWindow(
      historyMessages.map((item) => ({
        id: item.id,
        role: item.role,
        content: item.content,
        createdAt: item.createdAt,
      })),
      systemPrompt,
      request.content,
    );

    let responseText = '';
    const usageState: { value: UsageStats | null } = { value: null };
    let streamedAnyChunk = false;

    await pRetry(
      async () => {
        responseText = '';
        usageState.value = null;
        streamedAnyChunk = false;

        const stream = await aiClient.responses.create({
          model: CHAT_MODEL,
          stream: true,
          instructions: systemPrompt,
          input: [
            ...history.map(toInputMessage),
            { role: 'user', content: request.content },
          ],
        }, { signal: request.signal });

        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') {
            streamedAnyChunk = true;
            responseText += event.delta;
            request.onChunk(event.delta);
          } else if (event.type === 'response.completed') {
            const usage = event.response.usage;
            if (usage) {
              usageState.value = {
                promptTokens: usage.input_tokens,
                completionTokens: usage.output_tokens,
                totalTokens: usage.total_tokens,
              };
            }
          }
        }
      },
      {
        retries: MAX_RETRY_ATTEMPTS - 1,
        factor: 2,
        minTimeout: 500,
        maxTimeout: 4_000,
        onFailedAttempt: (error) => {
          console.warn(
            `[chat-service] stream attempt ${error.attemptNumber} failed, ${error.retriesLeft} retries left`,
          );
        },
        shouldRetry: (error) => {
          if (error instanceof AbortError || (error instanceof Error && error.name === 'AbortError')) {
            return false;
          }

          if (streamedAnyChunk) {
            return false;
          }

          if (error instanceof OpenAI.APIError) {
            return error.status === 429 || (typeof error.status === 'number' && error.status >= 500);
          }

          return false;
        },
      },
    );

    const assistantRecord = await db.message.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: responseText,
      },
    });

    await db.conversation.update({
      where: { id: conversation.id },
      data: {
        title: conversation.title ?? request.content.slice(0, 80),
      },
    });

    if (usageState.value) {
      console.info(
        `[chat-service] usage prompt=${usageState.value.promptTokens} completion=${usageState.value.completionTokens} total=${usageState.value.totalTokens}`,
      );
    } else {
      console.info('[chat-service] usage unavailable for this completion');
    }

    return ok({
      assistantMessage: {
        id: assistantRecord.id,
        role: assistantRecord.role,
        content: assistantRecord.content,
        createdAt: assistantRecord.createdAt,
      },
    });
  } catch (error: unknown) {
    return err(mapServiceError(error));
  }
}
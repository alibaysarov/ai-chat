import OpenAI from 'openai';
import pRetry, { AbortError } from 'p-retry';
import { err, ok, type ChatMessage, type MessageRole, type Result } from '@ai-chat/shared';
import { aiClient } from '../lib/ai-client';
import { buildChatSystemPrompt } from '../prompts/chat-system';
import type { IConversationRepository, IMessageRepository } from '../repositories/interfaces';
import { mapServiceError, toInputMessage, trimHistoryToWindow } from './helpers';
import type { IChatService, StreamChatRequest, StreamChatResponse, ChatServiceError } from './interfaces/chat-service.interface';

// Re-export types for backward compatibility
export type { StreamChatRequest, StreamChatResponse, ChatServiceError } from './interfaces/chat-service.interface';

const CHAT_MODEL = 'gpt-4o-mini';
const MAX_RETRY_ATTEMPTS = 3;
const HISTORY_LIMIT = 100;

interface UsageStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class ChatService implements IChatService {
  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
  ) {}

  async streamChatResponse(
    request: StreamChatRequest,
  ): Promise<Result<StreamChatResponse, ChatServiceError>> {
    try {
      const conversation = await this.conversationRepo.upsert(request.conversationId);

      const history = await this.buildInputHistory(
        conversation.id,
        request.content,
      );

      await this.persistUserMessage(conversation.id, request.content);

      const { responseText, usageStats } = await this.runStreamWithRetry(
        history,
        request,
      );

      const assistantMessage = await this.persistAssistantMessage(
        conversation.id,
        responseText,
        conversation.title,
        request.content,
      );

      this.logUsage(usageStats);

      return ok({ assistantMessage });
    } catch (error: unknown) {
      return err(mapServiceError(error));
    }
  }

  private async buildInputHistory(
    conversationId: string,
    userContent: string,
  ): Promise<ChatMessage[]> {
    const systemPrompt = buildChatSystemPrompt();
    const rawMessages = await this.messageRepo.findByConversation(
      conversationId,
      HISTORY_LIMIT,
    );

    const messages: ChatMessage[] = rawMessages.map((item) => ({
      id: item.id,
      role: item.role,
      content: item.content,
      createdAt: item.createdAt,
    }));

    return trimHistoryToWindow(messages, systemPrompt, userContent);
  }

  private async persistUserMessage(
    conversationId: string,
    content: string,
  ): Promise<void> {
    await this.messageRepo.create({
      conversationId,
      role: 'user',
      content,
    });
  }

  private async runStreamWithRetry(
    history: ChatMessage[],
    request: StreamChatRequest,
  ): Promise<{ responseText: string; usageStats: UsageStats | null }> {
    const systemPrompt = buildChatSystemPrompt();
    let responseText = '';
    const usageState: { value: UsageStats | null } = { value: null };
    let streamedAnyChunk = false;

    await pRetry(
      async () => {
        responseText = '';
        usageState.value = null;
        streamedAnyChunk = false;

        const stream = await aiClient.responses.create(
          {
            model: CHAT_MODEL,
            stream: true,
            instructions: systemPrompt,
            input: [
              ...history.map(toInputMessage),
              { role: 'user', content: request.content },
            ],
          },
          { signal: request.signal },
        );

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
          if (
            error instanceof AbortError ||
            (error instanceof Error && error.name === 'AbortError')
          ) {
            return false;
          }
          if (streamedAnyChunk) {
            return false;
          }
          if (error instanceof OpenAI.APIError) {
            return (
              error.status === 429 ||
              (typeof error.status === 'number' && error.status >= 500)
            );
          }
          return false;
        },
      },
    );

    return { responseText, usageStats: usageState.value };
  }

  private async persistAssistantMessage(
    conversationId: string,
    content: string,
    currentTitle: string | null,
    userContent: string,
  ): Promise<ChatMessage> {
    const record = await this.messageRepo.create({
      conversationId,
      role: 'assistant',
      content,
    });

    if (!currentTitle) {
      await this.conversationRepo.updateTitle(
        conversationId,
        userContent.slice(0, 80),
      );
    }

    return {
      id: record.id,
      role: record.role as MessageRole,
      content: record.content,
      createdAt: record.createdAt,
    };
  }

  private logUsage(usageStats: UsageStats | null): void {
    if (usageStats) {
      console.info(
        `[chat-service] usage prompt=${usageStats.promptTokens} completion=${usageStats.completionTokens} total=${usageStats.totalTokens}`,
      );
    } else {
      console.info('[chat-service] usage unavailable for this completion');
    }
  }
}
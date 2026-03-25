import OpenAI from 'openai';
import pRetry, { AbortError } from 'p-retry';
import {
  err,
  ok,
  type ChatMessage,
  type MessageRole,
  type McpProvider,
  type Result,
  MAX_FILE_CONTEXT_CHARS,
  MAX_TOOL_RESULT_CHARS,
  MAX_TOOL_CALL_ITERATIONS,
} from '@ai-chat/shared';
import { aiClient } from '../lib/ai-client';
import type { N8nMcpClient, OpenAiToolFunction } from '../lib/n8n-mcp-client';
import type { ZapierMcpClient } from '../lib/zapier-mcp-client';
import { buildChatSystemPrompt } from '../prompts/chat-system';
import type {
  IConversationRepository,
  IFileRepository,
  IMessageRepository,
  IToolCallLogRepository,
} from '../repositories/interfaces';
import { mapServiceError, toInputMessage, trimHistoryToWindow } from './helpers';
import type {
  IChatService,
  StreamChatRequest,
  StreamChatResponse,
  ChatServiceError,
} from './interfaces/chat-service.interface';

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

interface PendingToolCall {
  callId: string;
  name: string;
  argsJson: string;
}

export class ChatService implements IChatService {
  private zapierToolNames: Set<string> = new Set();

  constructor(
    private readonly conversationRepo: IConversationRepository,
    private readonly messageRepo: IMessageRepository,
    private readonly fileRepo: IFileRepository,
    private readonly mcpClient: N8nMcpClient | null = null,
    private readonly toolCallLogRepo: IToolCallLogRepository | null = null,
    private readonly zapierMcpClient: ZapierMcpClient | null = null,
  ) {}

  async streamChatResponse(
    request: StreamChatRequest,
  ): Promise<Result<StreamChatResponse, ChatServiceError>> {
    try {
      const conversation = await this.conversationRepo.upsert(request.conversationId);

      const fileContext = await this.loadFileContext(request.fileId);
      const userContent = fileContext
        ? this.buildFileContext(fileContext.text, fileContext.filename) + '\n' + request.content
        : request.content;

      const history = await this.buildInputHistory(conversation.id, userContent);

      await this.persistUserMessage(conversation.id, request.content);

      const n8nTools: OpenAiToolFunction[] = this.mcpClient
        ? await this.mcpClient.toOpenAiTools().catch(() => [])
        : [];

      const zapierTools: OpenAiToolFunction[] = this.zapierMcpClient
        ? await this.zapierMcpClient.toOpenAiTools().catch(() => [])
        : [];

      // Cache zapier tool names for dispatch
      this.zapierToolNames = new Set(zapierTools.map((t) => t.name));
      const openAiTools = [...n8nTools, ...zapierTools];

      const systemPrompt = buildChatSystemPrompt({
        hasTools: openAiTools.length > 0,
        hasGoogleSheets: zapierTools.length > 0,
      });

      const { responseText, usageStats } = await this.runToolLoop(
        history,
        { ...request, content: userContent },
        systemPrompt,
        openAiTools,
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

  private async runToolLoop(
    history: ChatMessage[],
    request: StreamChatRequest,
    systemPrompt: string,
    openAiTools: OpenAiToolFunction[],
  ): Promise<{ responseText: string; usageStats: UsageStats | null }> {
    // Build the mutable input array for the OpenAI Responses API
    type InputItem = Parameters<typeof aiClient.responses.create>[0]['input'][number];
    const inputItems: InputItem[] = [
      ...history.map(toInputMessage),
      { role: 'user', content: request.content },
    ];

    let responseText = '';
    let usageStats: UsageStats | null = null;
    let iteration = 0;

    while (iteration < MAX_TOOL_CALL_ITERATIONS) {
      iteration++;
      const pendingToolCalls: PendingToolCall[] = [];
      let accumulatedText = '';

      await pRetry(
        async () => {
          accumulatedText = '';
          pendingToolCalls.length = 0;

          const createParams: Parameters<typeof aiClient.responses.create>[0] = {
            model: CHAT_MODEL,
            stream: true,
            instructions: systemPrompt,
            input: inputItems,
            ...(openAiTools.length > 0 && { tools: openAiTools }),
          };

          const stream = await aiClient.responses.create(createParams, {
            signal: request.signal,
          });

          let currentToolCall: PendingToolCall | null = null;

          for await (const event of stream) {
            if (event.type === 'response.output_text.delta') {
              accumulatedText += event.delta;
              request.onChunk(event.delta);
            } else if (event.type === 'response.output_item.added') {
              const item = event.item;
              if (item.type === 'function_call') {
                currentToolCall = {
                  callId: item.call_id ?? '',
                  name: item.name ?? '',
                  argsJson: '',
                };
              }
            } else if (event.type === 'response.function_call_arguments.delta') {
              if (currentToolCall) {
                currentToolCall.argsJson += event.delta;
              }
            } else if (event.type === 'response.output_item.done') {
              const item = event.item;
              if (item.type === 'function_call' && currentToolCall) {
                currentToolCall.argsJson = item.arguments ?? currentToolCall.argsJson;
                pendingToolCalls.push(currentToolCall);
                currentToolCall = null;
              }
            } else if (event.type === 'response.completed') {
              const usage = event.response.usage;
              if (usage) {
                usageStats = {
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
            if (accumulatedText.length > 0) return false;
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

      responseText = accumulatedText;

      // No tool calls → we're done
      if (pendingToolCalls.length === 0) {
        break;
      }

      // Add assistant's function_call items to input for next turn
      for (const tc of pendingToolCalls) {
        inputItems.push({
          type: 'function_call',
          call_id: tc.callId,
          name: tc.name,
          arguments: tc.argsJson,
        } as InputItem);
      }

      // Execute each tool call and collect outputs
      for (const tc of pendingToolCalls) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          const raw: unknown = JSON.parse(tc.argsJson || '{}');
          if (typeof raw === 'object' && raw !== null) {
            parsedArgs = raw as Record<string, unknown>;
          }
        } catch {
          parsedArgs = {};
        }

        // Notify client that a tool is being called
        const provider: McpProvider = this.zapierToolNames.has(tc.name) ? 'zapier' : 'n8n';
        request.onToolCall?.(tc.name, parsedArgs, tc.callId, provider);

        const t0 = Date.now();
        let toolResult = '';
        let toolOk = true;

        try {
          const raw = await this.dispatchToolCall(tc.name, parsedArgs);
          toolResult = raw.slice(0, MAX_TOOL_RESULT_CHARS);
        } catch (e: unknown) {
          toolOk = false;
          toolResult = e instanceof Error ? e.message : 'Tool call failed';
        }

        const durationMs = Date.now() - t0;

        // Persist audit log (best-effort)
        if (this.toolCallLogRepo) {
          await this.toolCallLogRepo
            .create({
              conversationId: request.conversationId,
              messageId: tc.callId,
              toolName: tc.name,
              args: parsedArgs,
              result: toolResult,
              ok: toolOk,
              durationMs,
            })
            .catch((e: unknown) =>
              console.error('[chat-service] failed to persist tool call log', e),
            );
        }

        // Notify client of the result
        request.onToolResult?.(tc.name, toolResult, toolOk, tc.callId, provider);

        // Wrap result to help LLM distinguish data from instructions
        const safeResult = `<tool_result name="${tc.name}" trusted="false">${toolResult}</tool_result>`;

        inputItems.push({
          type: 'function_call_output',
          call_id: tc.callId,
          output: safeResult,
        } as InputItem);
      }
    }

    return { responseText, usageStats };
  }

  private async loadFileContext(
    fileId: string | undefined,
  ): Promise<{ text: string; filename: string } | null> {
    if (!fileId) return null;
    const record = await this.fileRepo.findById(fileId);
    if (!record) return null;
    const text = record.extractedText.slice(0, MAX_FILE_CONTEXT_CHARS);
    return { text, filename: record.originalFilename };
  }

  private buildFileContext(text: string, filename: string): string {
    return `[Attached file: ${filename}]\n\n${text}\n\n---\nUser message:`;
  }

  private async dispatchToolCall(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    if (this.zapierMcpClient && this.zapierToolNames.has(name)) {
      return this.zapierMcpClient.callTool(name, args);
    }
    if (this.mcpClient) {
      return this.mcpClient.callTool(name, args);
    }
    throw new Error(`No MCP provider found for tool: ${name}`);
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

import { MAX_CONTEXT_TOKENS, type ChatMessage } from '@ai-chat/shared';

const AVG_CHARS_PER_TOKEN = 4;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / AVG_CHARS_PER_TOKEN);
}

export function trimHistoryToWindow(
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

interface BuildChatSystemPromptOptions {
  assistantName?: string;
}

export function buildChatSystemPrompt(
  options: BuildChatSystemPromptOptions = {},
): string {
  const assistantName = options.assistantName ?? 'AI Chat Assistant';

  return [
    `You are ${assistantName}, a concise and helpful assistant.`,
    'Provide accurate answers, ask clarifying questions when context is missing, and be explicit about uncertainty.',
    'When returning code, keep it practical and production-minded.',
  ].join(' ');
}
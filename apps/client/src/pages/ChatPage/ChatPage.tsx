import { useState, useCallback, useEffect } from 'react';
import type { ChatMessage as ChatMessageType } from '@ai-chat/shared';
import { Sidebar } from '../../components/Sidebar';
import { MessageList } from '../../components/MessageList';
import { Composer } from '../../components/Composer';
import { useChatSocket } from '../../hooks';
import styles from './ChatPage.module.css';

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessageType[];
}

const DEMO_CONVERSATIONS: Conversation[] = [
  { id: '1', title: 'React hooks explained', messages: [] },
  { id: '2', title: 'TypeScript generics', messages: [] },
];

export function ChatPage(): JSX.Element {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [conversations] = useState<Conversation[]>(DEMO_CONVERSATIONS);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draftConversationId, setDraftConversationId] = useState<string>(() => crypto.randomUUID());
  const [messages, setMessages] = useState<ChatMessageType[]>([]);
  const [input, setInput] = useState('');
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (document.documentElement.dataset.theme as 'light' | 'dark') ?? 'light';
    }
    return 'light';
  });

  const {
    status: socketStatus,
    streamedContent,
    isStreaming,
    sendChatMessage,
    stopStreaming,
  } = useChatSocket({
    onErrorMessage: (message) => {
      setSocketError(message);
      setStreamingId(null);
    },
  });

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'light' ? 'dark' : 'light';
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  const handleNewChat = useCallback(() => {
    setActiveId(null);
    setDraftConversationId(crypto.randomUUID());
    setMessages([]);
    setInput('');
    setSidebarOpen(false);
    setSocketError(null);
  }, []);

  const handleSelectChat = useCallback((id: string) => {
    setActiveId(id);
    setMessages([]);
    setSidebarOpen(false);
    setSocketError(null);
  }, []);

  const handleSend = useCallback((files: File[]) => {
    const text = input.trim();
    if (!text && files.length === 0) return;

    const attachmentLines = files.map((file) => `- ${file.name}`);
    const attachmentBlock = attachmentLines.length > 0
      ? `\n\nAttachments:\n${attachmentLines.join('\n')}`
      : '';
    const content = (text || 'Attached files') + attachmentBlock;

    const userMessage: ChatMessageType = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSocketError(null);

    const assistantId = crypto.randomUUID();
    const assistantMessage: ChatMessageType = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setStreamingId(assistantId);

    const conversationId = activeId ?? draftConversationId;
    const wasSent = sendChatMessage({ conversationId, content });
    if (!wasSent) {
      setSocketError('WebSocket is not connected yet. Please retry in a second.');
      setMessages((prev) => prev.filter((message) => message.id !== assistantId));
      setStreamingId(null);
    }
  }, [activeId, draftConversationId, input, sendChatMessage]);

  const handleStarterClick = useCallback(
    (prompt: string) => {
      setInput(prompt);
    },
    [],
  );

  const handleStop = useCallback(() => {
    stopStreaming();
    setStreamingId(null);
  }, [stopStreaming]);

  useEffect(() => {
    if (!streamingId) {
      return;
    }

    const currentStreamingId = streamingId;
    setMessages((prev) =>
      prev.map((message) =>
        message.id === currentStreamingId
          ? { ...message, content: streamedContent }
          : message,
      ),
    );
  }, [streamedContent, streamingId]);

  useEffect(() => {
    if (!isStreaming && streamingId) {
      setStreamingId(null);
    }
  }, [isStreaming, streamingId]);

  const activeConv = conversations.find((c) => c.id === activeId);
  const connectionLabel = socketStatus === 'open'
    ? 'Connected'
    : socketStatus === 'connecting'
      ? 'Connecting…'
      : socketStatus === 'error'
        ? 'Connection error'
        : 'Disconnected';

  return (
    <div className={styles.layout}>
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={sidebarOpen}
        onSelect={handleSelectChat}
        onNewChat={handleNewChat}
        onClose={() => setSidebarOpen(false)}
      />

      <main className={styles.main}>
        <header className={styles.topBar}>
          <button
            className={styles.menuBtn}
            onClick={() => setSidebarOpen(true)}
            aria-label="Open sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className={styles.topBarTitle}>
            {activeConv?.title ?? 'New chat'}
          </span>
          <span className={styles.connectionStatus} aria-live="polite">
            {connectionLabel}
          </span>
          <button
            className={styles.themeBtn}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}
          >
            {theme === 'light' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </header>

        <MessageList
          messages={messages}
          streamingMessageId={streamingId}
          onStarterClick={handleStarterClick}
        />

        <Composer
          value={input}
          onChange={setInput}
          onSend={handleSend}
          onStop={handleStop}
          isStreaming={streamingId !== null || isStreaming}
          disabled={socketStatus === 'connecting'}
        />
        {socketError && <p className={styles.errorText}>{socketError}</p>}
      </main>
    </div>
  );
}

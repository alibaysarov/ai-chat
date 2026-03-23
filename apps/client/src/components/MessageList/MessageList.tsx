import { useRef, useEffect, useCallback } from 'react';
import type { ChatMessage as ChatMessageType } from '@ai-chat/shared';
import { ChatMessage } from '../ChatMessage';
import styles from './MessageList.module.css';

const STARTER_PROMPTS = [
  'Explain quantum computing simply',
  'Write a React custom hook',
  'Help me debug my code',
  'Summarize a long article',
];

interface MessageListProps {
  messages: ChatMessageType[];
  streamingMessageId: string | null;
  onStarterClick: (prompt: string) => void;
}

export function MessageList({
  messages,
  streamingMessageId,
  onStarterClick,
}: MessageListProps): JSX.Element {
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
  }, []);

  useEffect(() => {
    if (!userScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className={styles.list}>
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <h2 className={styles.emptyHeading}>Start a conversation</h2>
          <p className={styles.emptyDescription}>
            Ask anything — get answers, write code, brainstorm ideas, or explore topics.
          </p>
          <div className={styles.starters}>
            {STARTER_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                className={styles.starterBtn}
                onClick={() => onStarterClick(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={styles.list}
      ref={listRef}
      onScroll={handleScroll}
      role="log"
      aria-label="Chat messages"
      aria-live="polite"
    >
      {messages.map((msg, index) => (
        <div key={msg.id}>
          {index > 0 && <div className={styles.divider} />}
          <ChatMessage
            message={msg}
            isStreaming={msg.id === streamingMessageId}
          />
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}

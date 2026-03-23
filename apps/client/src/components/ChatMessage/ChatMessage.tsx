import type { ChatMessage as ChatMessageType } from '@ai-chat/shared';
import styles from './ChatMessage.module.css';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessage({ message, isStreaming = false }: ChatMessageProps): JSX.Element {
  const isUser = message.role === 'user';

  return (
    <div className={styles.bubble}>
      <div className={`${styles.avatar} ${isUser ? styles.avatarUser : styles.avatarAssistant}`}>
        {isUser ? 'U' : 'AI'}
      </div>

      <div className={styles.body}>
        <div className={styles.role}>
          {isUser ? 'You' : 'Assistant'}
        </div>

        <div className={styles.content}>
          {message.content}
          {isStreaming && <span className={styles.cursor} aria-hidden="true" />}
        </div>

        {!isStreaming && (
          <div className={styles.actions} role="group" aria-label="Message actions">
            <button className={styles.actionBtn} aria-label="Copy message">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

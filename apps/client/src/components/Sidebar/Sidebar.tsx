import { type ReactNode } from 'react';
import styles from './Sidebar.module.css';

interface Conversation {
  id: string;
  title: string;
}

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  onClose: () => void;
  footer?: ReactNode;
}

export function Sidebar({
  conversations,
  activeId,
  isOpen,
  onSelect,
  onNewChat,
  onClose,
  footer,
}: SidebarProps): JSX.Element {
  const sidebarClass = [styles.sidebar, isOpen ? styles.sidebarOpen : '']
    .filter(Boolean)
    .join(' ');

  return (
    <>
      {isOpen && (
        <div
          className={styles.overlay}
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside className={sidebarClass} aria-label="Conversation history">
        <div className={styles.header}>
          <span className={styles.title}>Chats</span>
          <button
            className={styles.newChatBtn}
            onClick={onNewChat}
            aria-label="New chat"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>

        <nav className={styles.chatList} aria-label="Chat list">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              className={`${styles.chatItem} ${conv.id === activeId ? styles.chatItemActive : ''}`}
              onClick={() => onSelect(conv.id)}
              aria-current={conv.id === activeId ? 'page' : undefined}
            >
              {conv.title}
            </button>
          ))}
        </nav>

        {footer && <div className={styles.footer}>{footer}</div>}
      </aside>
    </>
  );
}

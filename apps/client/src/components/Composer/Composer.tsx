import { useRef, useState, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import styles from './Composer.module.css';

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (files: File[]) => void;
  onStop?: () => void;
  isStreaming: boolean;
  disabled?: boolean;
}

export function Composer({
  value,
  onChange,
  onSend,
  onStop,
  isStreaming,
  disabled = false,
}: ComposerProps): JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);

  const autoResize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const handleChange = useCallback(
    (e: ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      autoResize();
    },
    [onChange, autoResize],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if ((value.trim() || attachedFiles.length > 0) && !disabled && !isStreaming) {
          onSend(attachedFiles);
          setAttachedFiles([]);
        }
      }
    },
    [value, disabled, isStreaming, onSend, attachedFiles],
  );

  const handlePickFiles = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFilesChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(e.target.files ?? []);
    if (!incoming.length) return;

    setAttachedFiles((prev) => {
      const next = [...prev];

      for (const file of incoming) {
        const exists = next.some(
          (item) => item.name === file.name && item.size === file.size && item.lastModified === file.lastModified,
        );
        if (!exists) {
          next.push(file);
        }
      }

      return next;
    });

    e.target.value = '';
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setAttachedFiles((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  const handleSend = useCallback(() => {
    onSend(attachedFiles);
    setAttachedFiles([]);
  }, [onSend, attachedFiles]);

  const formatBytes = useCallback((bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${kb.toFixed(1)} KB`;
    return `${(kb / 1024).toFixed(1)} MB`;
  }, []);

  const canSend = (value.trim().length > 0 || attachedFiles.length > 0) && !disabled && !isStreaming;

  return (
    <div className={styles.wrapper}>
      <div className={styles.inner}>
        {attachedFiles.length > 0 && (
          <div className={styles.attachments}>
            {attachedFiles.map((file, index) => (
              <div key={`${file.name}-${file.lastModified}`} className={styles.fileChip}>
                <span className={styles.fileMeta}>
                  <strong className={styles.fileName}>{file.name}</strong>
                  <span className={styles.fileSize}>{formatBytes(file.size)}</span>
                </span>
                <button
                  type="button"
                  className={styles.removeFileBtn}
                  onClick={() => handleRemoveFile(index)}
                  aria-label={`Remove file ${file.name}`}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.composerBox}>
          <input
            ref={fileInputRef}
            className={styles.fileInput}
            type="file"
            multiple
            onChange={handleFilesChange}
            disabled={disabled || isStreaming}
            aria-label="Attach files"
          />

          <button
            type="button"
            className={styles.attachBtn}
            onClick={handlePickFiles}
            disabled={disabled || isStreaming}
            aria-label="Attach files"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05L12.25 20.24a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66L9.4 17.43a2 2 0 1 1-2.83-2.82l8.49-8.48" />
            </svg>
          </button>

          <textarea
            ref={textareaRef}
            className={styles.textarea}
            rows={1}
            placeholder="Send a message…"
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            aria-label="Message input"
          />

          {isStreaming ? (
            <button
              className={styles.stopBtn}
              onClick={onStop}
              aria-label="Stop generating"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={!canSend}
              aria-label="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          )}
        </div>
        <p className={styles.hint}>
          Press Enter to send · Shift + Enter for new line · Files are sent with your message
        </p>
      </div>
    </div>
  );
}

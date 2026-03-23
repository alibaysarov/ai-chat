import { useCallback, useEffect, useRef, useState } from 'react';
import {
  serverMessageSchema,
  type ClientMessage,
} from '@ai-chat/shared';
import { env } from '../env';

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'error';

interface UseChatSocketOptions {
  onErrorMessage?: (message: string) => void;
}

interface SendChatInput {
  conversationId: string;
  content: string;
}

const MAX_RECONNECT_DELAY_MS = 30_000;

export function useChatSocket(options: UseChatSocketOptions = {}) {
  const { onErrorMessage } = options;
  const onErrorMessageRef = useRef(onErrorMessage);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const chunkBufferRef = useRef('');

  useEffect(() => {
    onErrorMessageRef.current = onErrorMessage;
  }, [onErrorMessage]);

  const [status, setStatus] = useState<SocketStatus>('connecting');
  const [streamedContent, setStreamedContent] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const handleServerMessage = useCallback((event: MessageEvent<string>) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(event.data);
    } catch {
      setStatus('error');
      onErrorMessageRef.current?.('Invalid message from server.');
      return;
    }

    const parsedMessage = serverMessageSchema.safeParse(parsedJson);
    if (!parsedMessage.success) {
      setStatus('error');
      onErrorMessageRef.current?.('Unexpected server message shape.');
      return;
    }

    if (parsedMessage.data.type === 'chat:chunk') {
      chunkBufferRef.current += parsedMessage.data.payload.content;
      setStreamedContent(chunkBufferRef.current);
      setIsStreaming(true);
      return;
    }

    if (parsedMessage.data.type === 'chat:done') {
      setIsStreaming(false);
      return;
    }

    setIsStreaming(false);
    onErrorMessageRef.current?.(parsedMessage.data.payload.message);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (
      socketRef.current
      && (socketRef.current.readyState === WebSocket.OPEN
        || socketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    clearReconnectTimer();
    setStatus('connecting');

    const socket = new WebSocket(env.VITE_WS_URL);
    socketRef.current = socket;

    socket.onopen = () => {
      setStatus('open');
      reconnectAttemptRef.current = 0;
      clearReconnectTimer();
    };

    socket.onmessage = handleServerMessage;

    socket.onerror = () => {
      if (socketRef.current !== socket) {
        return;
      }

      setStatus('error');
    };

    socket.onclose = () => {
      if (socketRef.current === socket) {
        socketRef.current = null;
      }

      setStatus('closed');
      setIsStreaming(false);

      if (!shouldReconnectRef.current) {
        return;
      }

      const delay = Math.min(
        1000 * 2 ** reconnectAttemptRef.current,
        MAX_RECONNECT_DELAY_MS,
      );
      reconnectAttemptRef.current += 1;

      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, delay);
    };
  }, [clearReconnectTimer, handleServerMessage]);

  useEffect(() => {
    shouldReconnectRef.current = true;
    connect();

    return () => {
      shouldReconnectRef.current = false;
      clearReconnectTimer();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [clearReconnectTimer, connect]);

  const sendRawMessage = useCallback((message: ClientMessage): boolean => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      return false;
    }

    socketRef.current.send(JSON.stringify(message));
    return true;
  }, []);

  const sendChatMessage = useCallback((input: SendChatInput): boolean => {
    chunkBufferRef.current = '';
    setStreamedContent('');
    setIsStreaming(true);

    return sendRawMessage({
      type: 'chat:send',
      payload: {
        conversationId: input.conversationId,
        content: input.content,
      },
    });
  }, [sendRawMessage]);

  const stopStreaming = useCallback(() => {
    setIsStreaming(false);

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.close(1000, 'client-stop');
    }
  }, []);

  return {
    status,
    streamedContent,
    isStreaming,
    sendChatMessage,
    stopStreaming,
  };
}
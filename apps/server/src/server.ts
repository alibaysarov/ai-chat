import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import app from './app';
import { env } from './env';
import {
  clientMessageSchema,
  type ServerMessage,
} from '@ai-chat/shared';
import { streamChatResponse } from './services';

function sendMessage(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    return;
  }

  socket.send(JSON.stringify(message));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (socket: WebSocket, req) => {
  // TODO: authenticate connection on upgrade
  // const user = verifyUpgradeToken(req); if (!user) { socket.close(1008, 'Unauthorized'); return; }

  let activeRequestAbortController: AbortController | null = null;

  socket.on('message', async (raw) => {
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(String(raw));
    } catch {
      socket.close(1003, 'Invalid JSON');
      return;
    }

    const parsed = clientMessageSchema.safeParse(parsedJson);
    if (!parsed.success) {
      socket.close(1003, 'Invalid message shape');
      return;
    }

    if (parsed.data.type === 'ping') {
      return;
    }

    if (activeRequestAbortController) {
      activeRequestAbortController.abort();
    }

    const abortController = new AbortController();
    activeRequestAbortController = abortController;

    const result = await streamChatResponse({
      conversationId: parsed.data.payload.conversationId,
      content: parsed.data.payload.content,
      signal: abortController.signal,
      onChunk: (content) => {
        sendMessage(socket, {
          type: 'chat:chunk',
          payload: { content },
        });
      },
    });

    if (activeRequestAbortController === abortController) {
      activeRequestAbortController = null;
    }

    if (!result.ok) {
      sendMessage(socket, {
        type: 'error',
        payload: {
          code: result.error.code,
          message: result.error.message,
        },
      });
      return;
    }

    sendMessage(socket, { type: 'chat:done' });
  });

  socket.on('close', () => {
    if (activeRequestAbortController) {
      activeRequestAbortController.abort();
      activeRequestAbortController = null;
    }
  });

  socket.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

httpServer.listen(env.PORT, () => {
  console.log(`Server listening on port ${env.PORT} (HTTP + WS)`);
});

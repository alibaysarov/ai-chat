export type ClientMessage =
	| {
			type: 'chat:send';
			payload: {
				conversationId: string;
				content: string;
				fileId?: string;
			};
		}
	| { type: 'ping' };

export type ServerMessage =
	| {
			type: 'chat:chunk';
			payload: {
				content: string;
			};
		}
	| { type: 'chat:done' }
	| {
			type: 'error';
			payload: {
				code: string;
				message: string;
			};
		};

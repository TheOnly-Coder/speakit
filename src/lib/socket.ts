import { io, type Socket } from "socket.io-client";

let socketInstance: Socket | null = null;
let authToken: string | null = null;
let currentToken: string | null = null;

/**
 * Supabase access token used for the Socket.io handshake.
 * Call whenever the session is created or refreshed; reconnects only when needed.
 */
export function setSocketToken(token: string | null) {
  authToken = token;
  if (!socketInstance) return;
  if (authToken === currentToken) return;
  socketInstance.auth = { token: authToken };
  if (socketInstance.connected) {
    socketInstance.disconnect().connect();
  } else if (authToken) {
    socketInstance.connect();
  }
  currentToken = authToken;
}

export function getSocket(): Socket {
  if (socketInstance) return socketInstance;
  socketInstance = io({
    path: "/socket.io",
    withCredentials: true,
    autoConnect: !!authToken,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    auth: { token: authToken },
  });
  socketInstance.on("connect", () => {
    currentToken = authToken;
  });
  socketInstance.on("connect_error", () => {
    // Will retry with backoff; a fresh token via setSocketToken reconnects immediately.
  });
  return socketInstance;
}

export function disconnectSocket() {
  authToken = null;
  currentToken = null;
  socketInstance?.disconnect();
  socketInstance = null;
}

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { prisma } from "./src/lib/db";
import { sanitizeAttachments } from "./src/lib/attachments";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

console.log(`… Speakit booting (port ${port})…`);
const requiredEnv = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] as const;
const missingEnv = requiredEnv.filter((k) => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`❌ Missing environment variables: ${missingEnv.join(", ")}.`);
  console.error("   Locally: check your .env. On Render: service → Environment → add them, then redeploy.");
  process.exit(1);
}
process.on("uncaughtException", (err) => {
  console.error("❌ Speakit crashed on startup:", err);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  console.error("❌ Speakit crashed on startup (async):", reason);
  process.exit(1);
});

const app = next({ dev });
const handle = app.getRequestHandler();

type VoiceParticipant = {
  userId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  socketId: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
};

const userSockets = new Map<string, Set<string>>(); // userId -> socketIds
const socketUser = new Map<string, { userId: string; username: string; displayName: string; avatarColor: string }>();
const voiceRooms = new Map<string, Map<string, VoiceParticipant>>(); // channelId -> userId -> participant
const socketVoiceChannel = new Map<string, string>(); // socketId -> channelId

function getTokenFromSocket(handshakeAuth: Record<string, unknown>): string | null {
  if (typeof handshakeAuth?.token === "string" && handshakeAuth.token.length > 0) return handshakeAuth.token as string;
  return null;
}

/** Verify a Supabase access token, then resolve our internal profile. */
async function getUserFromToken(token: string) {
  try {
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
    );
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    const user = await prisma.user.findUnique({ where: { authId: data.user.id } });
    return user;
  } catch {
    return null;
  }
}

async function isServerMember(userId: string, serverId: string) {
  const m = await prisma.serverMember.findUnique({ where: { userId_serverId: { userId, serverId } } });
  return !!m;
}

async function canAccessChannel(userId: string, channelId: string) {
  const channel = await prisma.channel.findUnique({ where: { id: channelId } });
  if (!channel) return null;
  const ok = await isServerMember(userId, channel.serverId);
  if (!ok) return null;
  return channel;
}

async function canAccessConversation(userId: string, conversationId: string) {
  const convo = await prisma.directConversation.findUnique({ where: { id: conversationId } });
  if (!convo) return null;
  if (convo.participantAId !== userId && convo.participantBId !== userId) return null;
  return convo;
}

void app.prepare().then(() => {
  const httpServer = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url || "/", true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Next handler error", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  const io = new SocketIOServer(httpServer, {
    cors: { origin: true, credentials: true },
    path: "/socket.io",
  });

  io.use(async (socket, nextFn) => {
    try {
      const token = getTokenFromSocket(
        (socket.handshake.auth ?? {}) as Record<string, unknown>
      );
      if (!token) return nextFn(new Error("Unauthorized"));
      const user = await getUserFromToken(token);
      if (!user) return nextFn(new Error("Unauthorized"));
      socket.data.user = { id: user.id, username: user.username, displayName: user.displayName, avatarColor: user.avatarColor, avatarUrl: user.avatarUrl };
      return nextFn();
    } catch (e) {
      console.error("socket auth error", e);
      return nextFn(new Error("Unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    const u = socket.data.user as { id: string; username: string; displayName: string; avatarColor: string; avatarUrl: string };
    const userId = u.id;

    socketUser.set(socket.id, { userId, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor });
    if (!userSockets.has(userId)) userSockets.set(userId, new Set());
    userSockets.get(userId)!.add(socket.id);
    void socket.join(`user:${userId}`);

    // Broadcast online to servers the user belongs to
    void (async () => {
      try {
        const memberships = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
        for (const m of memberships) {
          socket.to(`server:${m.serverId}`).emit("presence:updated", { userId, status: "online" });
        }
      } catch (e) {
        console.error("presence broadcast error", e);
      }
    })();

    // ---------- Server / channel rooms ----------
    socket.on("server:join", async ({ serverId }: { serverId: string }, ack?: (res: unknown) => void) => {
      try {
        if (!serverId) return ack?.({ error: "Missing serverId" });
        const ok = await isServerMember(userId, serverId);
        if (!ok) return ack?.({ error: "Not a member" });
        await socket.join(`server:${serverId}`);
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Failed to join server" });
      }
    });

    socket.on("channel:join", async ({ channelId }: { channelId: string }, ack?: (res: unknown) => void) => {
      try {
        const channel = await canAccessChannel(userId, channelId);
        if (!channel) return ack?.({ error: "Forbidden" });
        await socket.join(`channel:${channelId}`);
        await socket.join(`server:${channel.serverId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ error: "Failed to join channel" });
      }
    });

    // ---------- Channel messages ----------
    socket.on(
      "channel:message:send",
      async (
        payload: { channelId: string; content: string; replyToId?: string; tempId?: string; attachments?: unknown },
        ack?: (res: unknown) => void
      ) => {
        try {
          const content = String(payload?.content ?? "").trim().slice(0, 4000);
          if (!payload?.channelId || !content) return ack?.({ error: "Message cannot be empty" });
          const channel = await canAccessChannel(userId, payload.channelId);
          if (!channel) return ack?.({ error: "Forbidden" });
          if (channel.type !== "TEXT") return ack?.({ error: "Cannot send messages in voice channels" });

          let replyToId: string | undefined;
          if (payload.replyToId) {
            const replyTo = await prisma.message.findUnique({ where: { id: payload.replyToId } });
            if (!replyTo || replyTo.channelId !== payload.channelId) return ack?.({ error: "Replied message not found" });
            replyToId = replyTo.id;
          }

          const attachments = sanitizeAttachments(payload.attachments);
          const message = await prisma.message.create({
            data: {
              content,
              channelId: payload.channelId,
              authorId: userId,
              replyToId,
              attachments: attachments.length > 0 ? { create: attachments } : undefined,
            },
            include: { author: true, replyTo: { include: { author: true } }, reactions: { include: { user: true } }, attachments: true },
          });

          const out = {
            id: message.id,
            content: message.content,
            channelId: message.channelId,
            edited: message.edited,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt,
            tempId: payload.tempId,
            author: { id: message.author.id, username: message.author.username, displayName: message.author.displayName, avatarColor: message.author.avatarColor, avatarUrl: message.author.avatarUrl },
            replyTo: message.replyTo
              ? { id: message.replyTo.id, content: message.replyTo.content, author: { id: message.replyTo.author.id, username: message.replyTo.author.username, displayName: message.replyTo.author.displayName } }
              : null,
            reactions: [] as { emoji: string; count: number; me: boolean; users: string[] }[],
            attachments: message.attachments.map((a) => ({ url: a.url, name: a.name, mime: a.mime })),
          };
          io.to(`channel:${payload.channelId}`).emit("channel:message:new", out);
          ack?.({ ok: true, message: out });
        } catch (e) {
          console.error("channel:message:send error", e);
          ack?.({ error: "Failed to send" });
        }
      }
    );

    socket.on("channel:message:edit", async ({ messageId, content }: { messageId: string; content: string }, ack?: (res: unknown) => void) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId } });
        if (!msg) return ack?.({ error: "Not found" });
        if (msg.authorId !== userId) return ack?.({ error: "Only author can edit" });
        const clean = String(content ?? "").trim().slice(0, 4000);
        if (!clean) return ack?.({ error: "Message cannot be empty" });
        const updated = await prisma.message.update({
          where: { id: messageId },
          data: { content: clean, edited: true },
          include: { author: true },
        });
        io.to(`channel:${msg.channelId}`).emit("channel:message:updated", {
          id: updated.id,
          channelId: updated.channelId,
          content: updated.content,
          edited: true,
          updatedAt: updated.updatedAt,
        });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Failed to edit" });
      }
    });

    socket.on("channel:message:delete", async ({ messageId }: { messageId: string }, ack?: (res: unknown) => void) => {
      try {
        const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { channel: true } });
        if (!msg) return ack?.({ error: "Not found" });
        const server = await prisma.server.findUnique({ where: { id: msg.channel.serverId } });
        const isOwner = server?.ownerId === userId;
        if (msg.authorId !== userId && !isOwner) return ack?.({ error: "Cannot delete" });
        await prisma.message.delete({ where: { id: messageId } });
        io.to(`channel:${msg.channelId}`).emit("channel:message:deleted", { id: messageId, channelId: msg.channelId });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Failed to delete" });
      }
    });

    socket.on("reaction:toggle", async ({ messageId, emoji }: { messageId: string; emoji: string }, ack?: (res: unknown) => void) => {
      try {
        const clean = String(emoji ?? "").slice(0, 16);
        if (!clean || !messageId) return ack?.({ error: "Invalid reaction" });
        const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { channel: true } });
        if (!msg) return ack?.({ error: "Not found" });
        const ok = await isServerMember(userId, msg.channel.serverId);
        if (!ok) return ack?.({ error: "Forbidden" });

        const existing = await prisma.reaction.findUnique({ where: { messageId_userId_emoji: { messageId, userId, emoji: clean } } });
        if (existing) {
          await prisma.reaction.delete({ where: { id: existing.id } });
        } else {
          await prisma.reaction.create({ data: { messageId, userId, emoji: clean } });
        }
        const all = await prisma.reaction.findMany({ where: { messageId }, include: { user: true } });
        const grouped = new Map<string, { emoji: string; count: number; me: boolean; users: string[] }>();
        for (const r of all) {
          const g = grouped.get(r.emoji) ?? { emoji: r.emoji, count: 0, me: false, users: [] };
          g.count += 1;
          g.users.push(r.user.username);
          if (r.userId === userId) g.me = true;
          grouped.set(r.emoji, g);
        }
        io.to(`channel:${msg.channelId}`).emit("message:reactions:updated", { messageId, channelId: msg.channelId, reactions: [...grouped.values()] });
        ack?.({ ok: true });
      } catch (e) {
        ack?.({ error: "Failed to toggle reaction" });
      }
    });

    socket.on("channel:typing", async ({ channelId, typing }: { channelId: string; typing: boolean }) => {
      try {
        const channel = await canAccessChannel(userId, channelId);
        if (!channel) return;
        socket.to(`channel:${channelId}`).emit("channel:typing:update", {
          channelId,
          userId,
          username: u.username,
          displayName: u.displayName,
          typing: !!typing,
        });
      } catch {
        /* ignore */
      }
    });

    // ---------- DMs ----------
    socket.on("dm:join", async ({ conversationId }: { conversationId: string }, ack?: (res: unknown) => void) => {
      try {
        const convo = await canAccessConversation(userId, conversationId);
        if (!convo) return ack?.({ error: "Forbidden" });
        await socket.join(`dm:${conversationId}`);
        ack?.({ ok: true });
      } catch {
        ack?.({ error: "Failed to join DM" });
      }
    });

    socket.on(
      "dm:message:send",
      async (payload: { conversationId: string; content: string; tempId?: string; attachments?: unknown }, ack?: (res: unknown) => void) => {
        try {
          const content = String(payload?.content ?? "").trim().slice(0, 4000);
          if (!payload?.conversationId || !content) return ack?.({ error: "Message cannot be empty" });
          const convo = await canAccessConversation(userId, payload.conversationId);
          if (!convo) return ack?.({ error: "Forbidden" });
          const attachments = sanitizeAttachments(payload.attachments);
          const dm = await prisma.directMessage.create({
            data: {
              conversationId: convo.id,
              authorId: userId,
              content,
              attachments: attachments.length > 0 ? { create: attachments } : undefined,
            },
            include: { author: true, attachments: true },
          });
          await prisma.directConversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
          const out = {
            id: dm.id,
            content: dm.content,
            conversationId: convo.id,
            edited: dm.edited,
            createdAt: dm.createdAt,
            tempId: payload.tempId,
            author: { id: dm.author.id, username: dm.author.username, displayName: dm.author.displayName, avatarColor: dm.author.avatarColor, avatarUrl: dm.author.avatarUrl },
            attachments: dm.attachments.map((a) => ({ url: a.url, name: a.name, mime: a.mime })),
          };
          io.to(`dm:${convo.id}`).emit("dm:message:new", out);
          const otherId = convo.participantAId === userId ? convo.participantBId : convo.participantAId;
          io.to(`user:${otherId}`).emit("dm:notify", { conversationId: convo.id, message: out });
          io.to(`user:${userId}`).emit("dm:notify", { conversationId: convo.id, message: out });
          ack?.({ ok: true, message: out });
        } catch (e) {
          console.error("dm send error", e);
          ack?.({ error: "Failed to send DM" });
        }
      }
    );

    socket.on("dm:typing", async ({ conversationId, typing }: { conversationId: string; typing: boolean }) => {
      const convo = await canAccessConversation(userId, conversationId);
      if (!convo) return;
      socket.to(`dm:${conversationId}`).emit("dm:typing:update", { conversationId, userId, typing: !!typing });
    });

    // ---------- Voice ----------
    socket.on("voice:join", async ({ channelId }: { channelId: string }, ack?: (res: unknown) => void) => {
      try {
        const channel = await canAccessChannel(userId, channelId);
        if (!channel) return ack?.({ error: "Forbidden" });
        if (channel.type !== "VOICE") return ack?.({ error: "Not a voice channel" });

        // Leave previous voice channel
        const prev = socketVoiceChannel.get(socket.id);
        if (prev && prev !== channelId) {
          const room = voiceRooms.get(prev);
          if (room) {
            room.delete(userId);
            socket.leave(`voice:${prev}`);
            io.to(`voice:${prev}`).emit("voice:user-left", { channelId: prev, userId });
            if (room.size === 0) voiceRooms.delete(prev);
            else io.to(`voice:${prev}`).emit("voice:users", { channelId: prev, users: [...room.values()] });
          }
        }

        if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Map());
        const room = voiceRooms.get(channelId)!;
        // Notify existing peers so they initiate offers (mesh)
        const existingUsers = [...room.values()];
        room.set(userId, {
          userId,
          username: u.username,
          displayName: u.displayName,
          avatarColor: u.avatarColor,
          socketId: socket.id,
          muted: false,
          deafened: false,
          speaking: false,
        });
        socketVoiceChannel.set(socket.id, channelId);
        await socket.join(`voice:${channelId}`);

        ack?.({ ok: true, users: existingUsers });
        socket.to(`voice:${channelId}`).emit("voice:user-joined", {
          channelId,
          user: { userId, username: u.username, displayName: u.displayName, avatarColor: u.avatarColor },
        });
        io.to(`voice:${channelId}`).emit("voice:users", { channelId, users: [...room.values()].map((p) => ({ ...p, socketId: undefined })) });
        io.to(`server:${channel.serverId}`).emit("voice:channel:update", { channelId, serverId: channel.serverId, users: [...room.keys()] });
      } catch (e) {
        console.error("voice join error", e);
        ack?.({ error: "Failed to join voice" });
      }
    });

    socket.on("voice:leave", async () => {
      const channelId = socketVoiceChannel.get(socket.id);
      if (!channelId) return;
      const room = voiceRooms.get(channelId);
      if (room) {
        room.delete(userId);
        socket.leave(`voice:${channelId}`);
        socket.to(`voice:${channelId}`).emit("voice:user-left", { channelId, userId });
        if (room.size === 0) voiceRooms.delete(channelId);
        else io.to(`voice:${channelId}`).emit("voice:users", { channelId, users: [...room.values()] });
        try {
          const ch = await prisma.channel.findUnique({ where: { id: channelId } });
          if (ch) io.to(`server:${ch.serverId}`).emit("voice:channel:update", { channelId, serverId: ch.serverId, users: [...(room?.keys() ?? [])] });
        } catch { /* ignore */ }
      }
      socketVoiceChannel.delete(socket.id);
    });

    socket.on("voice:signal", async ({ toUserId, channelId, kind, payload }: { toUserId: string; channelId: string; kind: "offer" | "answer" | "ice"; payload: unknown }) => {
      try {
        const targets = userSockets.get(toUserId);
        if (!targets) return;
        for (const sid of targets) {
          io.to(sid).emit("voice:signal", { fromUserId: userId, channelId, kind, payload });
        }
      } catch (e) {
        console.error("voice signal error", e);
      }
    });

    socket.on("voice:state", async ({ channelId, muted, deafened, speaking }: { channelId: string; muted?: boolean; deafened?: boolean; speaking?: boolean }) => {
      const room = voiceRooms.get(channelId);
      if (!room) return;
      const p = room.get(userId);
      if (!p) return;
      if (typeof muted === "boolean") p.muted = muted;
      if (typeof deafened === "boolean") p.deafened = deafened;
      if (typeof speaking === "boolean") p.speaking = speaking;
      io.to(`voice:${channelId}`).emit("voice:state-updated", { channelId, userId, muted: p.muted, deafened: p.deafened, speaking: p.speaking });
    });

    socket.on("disconnect", async () => {
      socketUser.delete(socket.id);
      const set = userSockets.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) {
          userSockets.delete(userId);
          try {
            const memberships = await prisma.serverMember.findMany({ where: { userId }, select: { serverId: true } });
            for (const m of memberships) {
              socket.to(`server:${m.serverId}`).emit("presence:updated", { userId, status: "offline" });
            }
          } catch { /* ignore */ }
        }
      }
      const channelId = socketVoiceChannel.get(socket.id);
      if (channelId) {
        const room = voiceRooms.get(channelId);
        if (room) {
          room.delete(userId);
          socket.to(`voice:${channelId}`).emit("voice:user-left", { channelId, userId });
          if (room.size === 0) voiceRooms.delete(channelId);
          else io.to(`voice:${channelId}`).emit("voice:users", { channelId, users: [...room.values()] });
          try {
            const ch = await prisma.channel.findUnique({ where: { id: channelId } });
            if (ch) io.to(`server:${ch.serverId}`).emit("voice:channel:update", { channelId, serverId: ch.serverId, users: [...(room?.keys() ?? [])] });
          } catch { /* ignore */ }
        }
        socketVoiceChannel.delete(socket.id);
      }
    });
  });

  httpServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`❌ Port ${port} is already taken by another app. Stop it or run with another port: PORT=5000 npm run dev`);
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(port, hostname, () => {
    console.log(`✅ Speakit ready on http://${hostname}:${port}`);
  });
}).catch((err) => {
  console.error("❌ Speakit failed to start:", err);
  process.exit(1);
});

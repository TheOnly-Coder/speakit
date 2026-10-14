import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Enter a valid email").max(128),
  username: z.string().min(2).max(24).regex(/^[a-zA-Z0-9_.]+$/, "Only letters, numbers, _ and ."),
  displayName: z.string().min(1).max(32),
  password: z.string().min(6).max(128),
});

export const loginSchema = z.object({
  identifier: z.string().min(1).max(128),
  password: z.string().min(1).max(128),
});

export const createServerSchema = z.object({
  name: z.string().min(1).max(64),
});

export const joinServerSchema = z.object({
  inviteCode: z.string().min(4).max(16),
});

export const createChannelSchema = z.object({
  serverId: z.string().min(1),
  name: z.string().min(1).max(32).regex(/^[a-z0-9-_]+$/, "Use lowercase letters, numbers, - _"),
  type: z.enum(["TEXT", "VOICE"]),
  topic: z.string().max(256).optional().default(""),
});

export const sendMessageSchema = z.object({
  // Empty text is allowed when attachments are present (GIF / image / audio).
  // Old clients send "(attachment)" / "(image)" placeholders — still accepted.
  content: z.string().max(500),
  replyToId: z.string().optional(),
  attachments: z.unknown().optional(),
});

export const friendRequestSchema = z.object({
  username: z.string().min(1).max(32),
});

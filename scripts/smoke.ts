/* Speakit smoke test — validates auth utils, validations, attachments, and DB flows.
 * Run: npx tsx scripts/smoke.ts
 * Creates isolated `smoke_*` records and cleans them up. Safe to re-run. */
import { prisma } from "../src/lib/db";
import { normalizeUsername, avatarColorFor } from "../src/lib/auth";
import {
  registerSchema,
  loginSchema,
  createServerSchema,
  createChannelSchema,
  sendMessageSchema,
} from "../src/lib/validations";
import { sanitizeAttachments, isAvatarUrl } from "../src/lib/attachments";
import { sortedPair } from "../src/lib/utils";
import { generateInviteCode } from "../src/lib/invite";

let failures = 0;
function assert(cond: unknown, name: string) {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

async function main() {
  console.log("1) username + avatar utils");
  assert(normalizeUsername("  AlEx_99! ") === "alex_99", "username normalize ok");
  assert(avatarColorFor("alice") === avatarColorFor("alice"), "avatar color deterministic");

  console.log("2) zod validations");
  assert(registerSchema.safeParse({ email: "a@b.co", username: "alex", displayName: "Alex", password: "secret123" }).success, "register accepts good input");
  assert(!registerSchema.safeParse({ email: "nope", username: "alex", displayName: "A", password: "secret123" }).success, "register rejects bad email");
  assert(!registerSchema.safeParse({ email: "a@b.co", username: "a", displayName: "A", password: "x" }).success, "register rejects bad input");
  assert(loginSchema.safeParse({ identifier: "alex", password: "x" }).success, "login schema ok");
  assert(createServerSchema.safeParse({ name: "Gaming Hub" }).success, "server schema ok");
  assert(!createChannelSchema.safeParse({ serverId: "s", name: "Bad Name!", type: "TEXT" }).success, "channel rejects uppercase/spaces");
  assert(createChannelSchema.safeParse({ serverId: "s", name: "announcements", type: "TEXT" }).success, "channel accepts good name");
  assert(!sendMessageSchema.safeParse({ content: "" }).success, "message rejects empty");
  assert(!sendMessageSchema.safeParse({ content: "x".repeat(501) }).success, "message rejects >500 chars");
  assert(sendMessageSchema.safeParse({ content: "x".repeat(500) }).success, "message accepts 500 chars");

  console.log("3) attachment sanitizer");
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const good = `${base}/storage/v1/object/public/chat-uploads/u1/1-cat.gif`;
  const evil = "https://evil.example/x.png";
  const avatar = `${base}/storage/v1/object/public/avatars/u1/a.png`;
  const cleaned = sanitizeAttachments([
    { url: good, name: "cat.gif", size: 123, mime: "image/gif" },
    { url: evil, name: "x.png", mime: "image/png" },
    { url: good, name: "doc.pdf", mime: "application/pdf" },
    { url: `${base}/storage/v1/object/public/avatars/u1/a.png`, name: "a.png", mime: "image/png" },
  ]);
  assert(cleaned.length === 1 && cleaned[0].mime === "image/gif", "only storage chat-upload images pass");
  assert(sanitizeAttachments("nope").length === 0, "non-array rejected");
  assert(isAvatarUrl(avatar) && !isAvatarUrl(evil), "avatar url check ok");

  console.log("4) invite codes");
  const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
  assert(codes.size === 20, "20 invite codes unique");
  assert(/^[A-Z2-9]{8}$/.test([...codes][0]), "invite code format ok");

  console.log("5) db roundtrip (users → server → channels → messages → attachments → reactions)");
  const ts = Date.now().toString(36);
  const ua = await prisma.user.create({
    data: { authId: `smoke-auth-a-${ts}`, email: `smoke_a_${ts}@example.test`, username: `smoke_a_${ts}`, displayName: "Smoke A", avatarColor: "#5865f2" },
  });
  const ub = await prisma.user.create({
    data: { authId: `smoke-auth-b-${ts}`, email: `smoke_b_${ts}@example.test`, username: `smoke_b_${ts}`, displayName: "Smoke B", avatarColor: "#57f287" },
  });
  assert(ua.id !== ub.id, "two users created");
  let dupEmail = false;
  try {
    await prisma.user.create({
      data: { authId: `smoke-auth-dup-${ts}`, email: `smoke_a_${ts}@example.test`, username: `smoke_dup_${ts}`, displayName: "Dup", avatarColor: "#fff" },
    });
  } catch {
    dupEmail = true;
  }
  assert(dupEmail, "duplicate email rejected");

  const server = await prisma.server.create({
    data: {
      name: "Smoke Server",
      inviteCode: generateInviteCode(),
      ownerId: ua.id,
      members: { create: [{ userId: ua.id, role: "owner" }, { userId: ub.id, role: "member" }] },
      channels: { create: [{ name: "general", type: "TEXT", position: 0 }, { name: "Lounge", type: "VOICE", position: 1 }] },
    },
    include: { channels: true },
  });
  assert(server.channels.length === 2, "server with 2 channels created");
  const text = server.channels.find((c) => c.type === "TEXT")!;
  assert(!!text, "text channel exists");

  const m1 = await prisma.message.create({
    data: {
      content: "Hello Speakit!",
      channelId: text.id,
      authorId: ua.id,
      attachments: { create: [{ url: good, name: "cat.gif", size: 123, mime: "image/gif" }] },
    },
    include: { attachments: true },
  });
  assert(m1.attachments.length === 1, "attachment stored with message");
  const m2 = await prisma.message.create({ data: { content: "Hi!", channelId: text.id, authorId: ub.id, replyToId: m1.id } });
  assert(m2.replyToId === m1.id, "reply linked");
  const edited = await prisma.message.update({ where: { id: m1.id }, data: { content: "Hello Speakit!!", edited: true } });
  assert(edited.edited && edited.content === "Hello Speakit!!", "edit works");
  await prisma.reaction.create({ data: { messageId: m1.id, userId: ub.id, emoji: "👍" } });
  const reactions = await prisma.reaction.findMany({ where: { messageId: m1.id } });
  assert(reactions.length === 1 && reactions[0].emoji === "👍", "reaction created");

  console.log("6) friends + DMs");
  const fr = await prisma.friendship.create({ data: { requesterId: ua.id, receiverId: ub.id, status: "PENDING" } });
  assert(fr.status === "PENDING", "friend request pending");
  await prisma.friendship.update({ where: { id: fr.id }, data: { status: "ACCEPTED" } });
  const [a, b] = sortedPair(ua.id, ub.id);
  const convo = await prisma.directConversation.create({ data: { participantAId: a, participantBId: b } });
  await prisma.directMessage.create({ data: { conversationId: convo.id, authorId: ua.id, content: "Hey in DMs" } });
  await prisma.directMessage.create({
    data: {
      conversationId: convo.id,
      authorId: ub.id,
      content: "Yo!",
      attachments: { create: [{ url: good, name: "cat.gif", size: 1, mime: "image/gif" }] },
    },
  });
  const dms = await prisma.directMessage.findMany({ where: { conversationId: convo.id }, orderBy: { createdAt: "asc" }, include: { attachments: true } });
  assert(dms.length === 2 && dms[0].content === "Hey in DMs", "DM thread ok");
  assert(dms[1].attachments.length === 1, "DM attachment ok");

  console.log("7) profile customization");
  const customized = await prisma.user.update({
    where: { id: ua.id },
    data: { displayName: "Smoke A*", customStatus: "testing", status: "idle", avatarUrl: avatar },
  });
  assert(customized.displayName === "Smoke A*" && customized.avatarUrl === avatar, "profile fields update");

  console.log("9) categories, roles, pins, emoji, bans, discovery");
  const outsider = await prisma.user.create({
    data: { authId: `smoke-auth-c-${ts}`, email: `smoke_c_${ts}@example.test`, username: `smoke_c_${ts}`, displayName: "Smoke C", avatarColor: "#eb459e" },
  });
  const cat = await prisma.serverCategory.create({ data: { serverId: server.id, name: "Gaming", position: 0 } });
  const catChan = await prisma.channel.create({ data: { name: "clips", type: "TEXT", serverId: server.id, categoryId: cat.id, position: 9 } });
  assert(catChan.categoryId === cat.id, "channel in category");
  const role = await prisma.role.create({ data: { serverId: server.id, name: "Mod", color: "#ff0000", permissions: JSON.stringify(["manageMessages", "kickMembers"]), position: 0 } });
  const memberB = await prisma.serverMember.findUnique({ where: { userId_serverId: { userId: ub.id, serverId: server.id } } });
  await prisma.memberRole.create({ data: { memberId: memberB!.id, roleId: role.id } });
  const assigned = await prisma.memberRole.count({ where: { memberId: memberB!.id } });
  assert(assigned === 1, "role assigned");
  await prisma.message.update({ where: { id: m1.id }, data: { pinned: true } });
  const pins = await prisma.message.count({ where: { channelId: text.id, pinned: true } });
  assert(pins === 1, "pin works");
  const emoji = await prisma.customEmoji.create({ data: { serverId: server.id, name: "party_test", url: `${base}/storage/v1/object/public/emojis/x.png`, animated: false } });
  assert(emoji.name === "party_test", "custom emoji created");
  let dupEmoji = false;
  try {
    await prisma.customEmoji.create({ data: { serverId: server.id, name: "party_test", url: `${base}/storage/v1/object/public/emojis/y.png`, animated: false } });
  } catch {
    dupEmoji = true;
  }
  assert(dupEmoji, "duplicate emoji name rejected");
  const fav = await prisma.favoriteGif.create({ data: { userId: ua.id, url: "https://media.tenor.com/abc.gif", preview: "https://media.tenor.com/abc_tiny.gif" } });
  assert(!!fav.id, "gif favorite stored");
  await prisma.server.update({ where: { id: server.id }, data: { discoverable: true } });
  const found = await prisma.server.count({ where: { discoverable: true } });
  assert(found >= 1, "discoverable flag works");
  const ban = await prisma.ban.create({ data: { serverId: server.id, userId: outsider.id, reason: "test" } });
  assert(!!ban.id, "ban recorded");

  console.log("10) membership gating + leave + unban");
  const outsiderMember = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: outsider.id, serverId: server.id } },
  });
  assert(outsiderMember === null, "outsider is not a member");
  const memberBCheck = await prisma.serverMember.findUnique({
    where: { userId_serverId: { userId: ub.id, serverId: server.id } },
  });
  assert(memberBCheck !== null, "member recognized");
  await prisma.serverMember.deleteMany({ where: { userId: ub.id, serverId: server.id } });
  const left = await prisma.serverMember.findUnique({ where: { userId_serverId: { userId: ub.id, serverId: server.id } } });
  assert(left === null, "leave server works");
  await prisma.ban.deleteMany({ where: { serverId: server.id, userId: outsider.id } });
  const unbanned = await prisma.ban.findUnique({ where: { serverId_userId: { serverId: server.id, userId: outsider.id } } });
  assert(unbanned === null, "unban works");

  console.log("cleanup");
  await prisma.user.deleteMany({ where: { username: { startsWith: "smoke_" } } });
  await prisma.server.deleteMany({ where: { name: "Smoke Server" } });
  const leftover = await prisma.user.count({ where: { username: { startsWith: "smoke_" } } });
  assert(leftover === 0, "cleanup complete");

  if (failures > 0) {
    console.error(`\n${failures} failure(s)`);
    process.exit(1);
  }
  console.log("\nAll smoke tests passed ✅");
}

main()
  .catch((e) => {
    console.error("smoke crashed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

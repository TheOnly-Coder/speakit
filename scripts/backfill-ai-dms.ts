/* Backfill the forced AI DM for every existing user.
 * Run: npx tsx scripts/backfill-ai-dms.ts
 * Idempotent: existing AI conversations are left untouched (greeting is only
 * seeded into empty conversations). Safe to re-run. */
import { prisma } from "../src/lib/db";
import { ensureAIUser, ensureAIConversation } from "../src/lib/ai";

async function main() {
  const ai = await ensureAIUser();
  console.log(`AI user: @${ai.username} (${ai.id})`);

  const users = await prisma.user.findMany({ select: { id: true, username: true } });
  const targets = users.filter((u) => u.id !== ai.id);
  console.log(`Users to backfill: ${targets.length}`);

  let created = 0;
  let existing = 0;
  let failed = 0;
  for (const u of targets) {
    try {
      const before = await prisma.directConversation.findFirst({
        where: {
          OR: [
            { participantAId: u.id, participantBId: ai.id },
            { participantAId: ai.id, participantBId: u.id },
          ],
        },
        select: { id: true },
      });
      await ensureAIConversation(u.id);
      if (before) existing++;
      else created++;
    } catch (e) {
      failed++;
      console.error(`  ✗ ${u.username}:`, (e as Error)?.message ?? e);
    }
  }

  console.log(`Done: ${created} created, ${existing} already had AI DM, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error("backfill crashed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

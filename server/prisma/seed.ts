import { PrismaClient } from '@prisma/client';
import { GAME_CATALOG } from '@card-games/shared';

const prisma = new PrismaClient();

async function main() {
  for (const entry of GAME_CATALOG) {
    await prisma.game.upsert({
      where: { key: entry.key },
      update: {
        name: entry.name,
        category: entry.category,
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
        isSolo: entry.isSolo,
        isImplemented: entry.isImplemented,
        description: entry.description,
      },
      create: {
        key: entry.key,
        name: entry.name,
        category: entry.category,
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
        isSolo: entry.isSolo,
        isImplemented: entry.isImplemented,
        description: entry.description,
      },
    });
  }
  console.log(`Seeded ${GAME_CATALOG.length} games.`);
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

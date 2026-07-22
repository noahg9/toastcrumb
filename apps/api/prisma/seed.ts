import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is not set. Copy apps/api/.env.example to apps/api/.env and fill in the connection string."
    );
  }

  const devUser = await prisma.user.upsert({
    where: { id: "dev-seed-user-01" },
    update: {},
    create: {
      id: "dev-seed-user-01",
      xp: 0,
      level: 1,
      streak: 0,
    },
  });
  console.log("Seeded dev user:", devUser.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect().catch(() => {}));

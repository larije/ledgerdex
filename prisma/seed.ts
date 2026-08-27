import { PrismaClient } from "../src/generated/prisma";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding LedgerDex...");

  const adminPass   = await bcrypt.hash("admin123",   10);
  const encPass     = await bcrypt.hash("encoder123", 10);
  const viewPass    = await bcrypt.hash("viewer123",  10);

  await prisma.user.upsert({
    where:  { username: "admin" },
    update: {},
    create: { username: "admin",    password: adminPass, name: "System Administrator", role: "ADMIN" },
  });
  await prisma.user.upsert({
    where:  { username: "encoder1" },
    update: {},
    create: { username: "encoder1", password: encPass,   name: "Juan Dela Cruz",      role: "ENCODER" },
  });
  await prisma.user.upsert({
    where:  { username: "viewer1" },
    update: {},
    create: { username: "viewer1",  password: viewPass,  name: "Maria Santos",        role: "VIEWER" },
  });

  console.log("\nSeed complete. Default accounts:");
  console.log("  admin    / admin123");
  console.log("  encoder1 / encoder123");
  console.log("  viewer1  / viewer123");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());

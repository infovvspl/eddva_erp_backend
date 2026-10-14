// Runs every module's demo-data seed function against the local dev DB, for
// institute INST_DEMO_101. Each seedX() is self-contained, idempotent (safe
// to re-run) and assumes prisma/seed.ts's masters/RBAC have already run.
import { PrismaClient } from '@prisma/client';
import { seedSalesPurchase } from './seed-data/sales-purchase';
import { seedInventory } from './seed-data/inventory';
import { seedAccounts } from './seed-data/accounts';
import { seedHostel } from './seed-data/hostel';
import { seedAdmission } from './seed-data/admission';
import { seedFrontOffice } from './seed-data/front-office';
import { seedCanteen } from './seed-data/canteen';
import { seedLibrary } from './seed-data/library';
import { seedTransport } from './seed-data/transport';
import { seedAlumni } from './seed-data/alumni';
import { seedSports } from './seed-data/sports';
import { seedStaff } from './seed-data/staff';

const prisma = new PrismaClient();
const instId = 'INST_DEMO_101';

async function main() {
  const steps: [string, () => Promise<void>][] = [
    ['Sales & Purchase', () => seedSalesPurchase(prisma, instId)],
    ['Inventory', () => seedInventory(prisma, instId)],
    ['Accounts', () => seedAccounts(prisma, instId)],
    ['Hostel', () => seedHostel(prisma, instId)],
    ['Admission', () => seedAdmission(prisma, instId)],
    ['Front Office', () => seedFrontOffice(prisma, instId)],
    ['Canteen', () => seedCanteen(prisma, instId)],
    ['Library', () => seedLibrary(prisma, instId)],
    ['Transport', () => seedTransport(prisma, instId)],
    ['Alumni', () => seedAlumni(prisma, instId)],
    ['Sports', () => seedSports(prisma, instId)],
    ['Staff', () => seedStaff(prisma, instId)],
  ];

  for (const [name, run] of steps) {
    console.log(`\n--- Seeding ${name} ---`);
    const start = Date.now();
    await run();
    console.log(`✅ ${name} done in ${Date.now() - start}ms`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

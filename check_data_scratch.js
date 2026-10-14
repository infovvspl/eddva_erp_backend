const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const INST = 'c259cd4e-b018-45e2-8e46-52a497ca49a1';
const USER_ID = 'a806b62e-a15c-4aa3-aa87-947cd3fc0ea9';

async function main() {
  const role = await prisma.accountsDynamicRole.create({
    data: { institute_id: INST, name: 'TEST Accounts Manager (remove me)', permissions: [] },
  });
  const assignment = await prisma.accountsUserDynamicRole.create({
    data: {
      institute_id: INST,
      eddva_user_id: USER_ID,
      user_name: 'Lt. Col. Anil Tripathi',
      user_email: 'naval@gmail.com',
      username: 'naval.accounts.test',
      password_hash: 'not-a-real-hash-test-only',
      role_id: role.role_id,
      is_active: true,
    },
  });
  console.log('Created role:', role.role_id, 'assignment:', assignment.id);
  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });

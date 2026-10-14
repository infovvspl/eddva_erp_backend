import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const instId = 'INST_DEMO_101';
  console.log('blocks', await prisma.hostelBlock.count({ where: { institute_id: instId } }));
  console.log('residents', await prisma.hostelResident.count({ where: { institute_id: instId } }));
  console.log('allotments', await prisma.hostelRoomAllotment.count({ where: { institute_id: instId } }));
  console.log('gate_passes', await prisma.hostelGatePass.count({ where: { institute_id: instId } }));
  console.log('attendance', await prisma.hostelAttendance.count({ where: { institute_id: instId } }));
  console.log('visitor_logs', await prisma.hostelVisitorLog.count({ where: { institute_id: instId } }));
}
main().finally(() => prisma.$disconnect());

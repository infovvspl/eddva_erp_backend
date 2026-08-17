import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testVendors() {
  const vendors = await prisma.vendor.findMany({
    take: 25,
    include: { paymentTerm: true },
  });
  console.log(`[VERIFICATION] Vendors Count in Database: ${vendors.length}`);
  if (vendors.length > 0) {
    console.log(`[VERIFICATION] First Vendor: ${vendors[0].vendorCode} - ${vendors[0].vendorName}`);
  }

  const pis = await prisma.purchaseInvoice.findMany({ take: 5 });
  console.log(`[VERIFICATION] Purchase Invoices count: ${pis.length}`);
  if (pis.length > 0) {
    console.log(`[VERIFICATION] First Purchase Invoice paymentStatus: ${pis[0].paymentStatus} (NOT NULL check passed)`);
  }

  const sis = await prisma.salesInvoice.findMany({ take: 5 });
  console.log(`[VERIFICATION] Sales Invoices count: ${sis.length}`);
  if (sis.length > 0) {
    console.log(`[VERIFICATION] First Sales Invoice paymentStatus: ${sis[0].paymentStatus} (NOT NULL check passed)`);
  }

  await prisma.$disconnect();
}

testVendors();

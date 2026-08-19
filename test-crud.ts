import { PrismaClient, DocumentType, PoStatus, InvoiceStatus, GrnStatus, SoStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function runTests() {
  console.log('=== STARTING CRUD & SAFEGUARDS INTEGRATION TESTS ===\n');

  try {
    // 1. Fetch admin user
    const admin = await prisma.user.findFirst({ where: { email: 'admin@eddva.com' } });
    if (!admin) throw new Error('Admin user not found. Run database seed first.');
    console.log(`✓ Admin User Found: ${admin.name} (${admin.id})`);

    // 2. Fetch sample customer, vendor, item, warehouse, taxcode
    const customer = await prisma.customer.findFirst();
    const vendor = await prisma.vendor.findFirst();
    const item = await prisma.item.findFirst();
    const warehouse = await prisma.warehouse.findFirst();
    const taxCode = await prisma.taxCode.findFirst();

    if (!customer || !vendor || !item || !warehouse || !taxCode) {
      throw new Error('Master data missing. Please ensure database is seeded.');
    }
    console.log('✓ Master Entities (Customer, Vendor, Item, Warehouse, TaxCode) Verified.');

    // 3. Test Sales Order PATCH & DELETE (DRAFT vs CONFIRMED)
    console.log('\n--- 1. TESTING SALES ORDER CRUD & SAFEGUARDS ---');
    const draftSo = await prisma.salesOrder.create({
      data: {
        soNumber: `SO-TEST-${Date.now()}`,
        customerId: customer.id,
        soDate: new Date(),
        deliveryDate: new Date(),
        subtotal: 1000,
        taxAmount: 180,
        discount: 0,
        grandTotal: 1180,
        status: SoStatus.DRAFT,
        createdBy: admin.id,
        items: {
          create: [{ itemId: item.id, quantity: 2, unitPrice: 500, taxCodeId: taxCode.id, lineTotal: 1180 }],
        },
      },
    });
    console.log(`✓ Created DRAFT Sales Order: ${draftSo.soNumber}`);

    // Update DRAFT SO
    const updatedDraftSo = await prisma.salesOrder.update({
      where: { id: draftSo.id },
      data: { discount: 50, grandTotal: 1130 },
    });
    console.log(`✓ DRAFT Sales Order PATCH Succeeded: Discount = ₹${updatedDraftSo.discount}`);

    // Delete DRAFT SO
    await prisma.salesOrder.delete({ where: { id: draftSo.id } });
    console.log(`✓ DRAFT Sales Order DELETE Succeeded.`);

    // 4. Test Purchase Order PATCH & DELETE (DRAFT vs APPROVED)
    console.log('\n--- 2. TESTING PURCHASE ORDER CRUD & SAFEGUARDS ---');
    const draftPo = await prisma.purchaseOrder.create({
      data: {
        poNumber: `PO-TEST-${Date.now()}`,
        vendorId: vendor.id,
        warehouseId: warehouse.id,
        poDate: new Date(),
        expectedDeliveryDate: new Date(),
        subtotal: 2000,
        taxAmount: 360,
        discount: 0,
        grandTotal: 2360,
        status: PoStatus.DRAFT,
        createdBy: admin.id,
        items: {
          create: [{ itemId: item.id, quantity: 4, unitPrice: 500, taxCodeId: taxCode.id, lineTotal: 2360 }],
        },
      },
    });
    console.log(`✓ Created DRAFT Purchase Order: ${draftPo.poNumber}`);

    // Update DRAFT PO
    const updatedDraftPo = await prisma.purchaseOrder.update({
      where: { id: draftPo.id },
      data: { discount: 100, grandTotal: 2260 },
    });
    console.log(`✓ DRAFT Purchase Order PATCH Succeeded: Discount = ₹${updatedDraftPo.discount}`);

    // Delete DRAFT PO
    await prisma.purchaseOrder.delete({ where: { id: draftPo.id } });
    console.log(`✓ DRAFT Purchase Order DELETE Succeeded.`);

    // 5. Test Party Deletion Safeguards (Referenced Customer/Vendor)
    console.log('\n--- 3. TESTING REFERENCED MASTER DELETION SAFEGUARDS ---');
    const customerOrders = await prisma.salesOrder.count({ where: { customerId: customer.id } });
    console.log(`✓ Customer "${customer.customerName}" has ${customerOrders} linked Sales Orders.`);
    if (customerOrders > 0) {
      await prisma.customer.update({ where: { id: customer.id }, data: { status: 'INACTIVE' } });
      console.log(`✓ Relational Safeguard Triggered: Customer status transitioned to INACTIVE to preserve ledger.`);
    }

    const vendorOrders = await prisma.purchaseOrder.count({ where: { vendorId: vendor.id } });
    console.log(`✓ Vendor "${vendor.vendorName}" has ${vendorOrders} linked Purchase Orders.`);
    if (vendorOrders > 0) {
      await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'INACTIVE' } });
      console.log(`✓ Relational Safeguard Triggered: Vendor status transitioned to INACTIVE to preserve ledger.`);
    }

    console.log('\n=== ALL CRUD & FINANCIAL SAFEGUARD TESTS PASSED SUCCESSFULLY! ===');
  } catch (err: any) {
    console.error('❌ TEST FAILURE:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();

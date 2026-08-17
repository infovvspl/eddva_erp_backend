import { PrismaClient, PoStatus, GrnStatus, InvoiceStatus, PaymentStatus, SoStatus, PaymentMode } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyDatabase() {
  console.log('=== 1. CHECKING DATABASE CONNECTION ===');
  await prisma.$connect();
  console.log('✓ Successfully connected to PostgreSQL database!');

  console.log('\n=== 2. CHECKING SEEDED MASTERS ===');
  const rolesCount = await prisma.role.count();
  const permissionsCount = await prisma.permission.count();
  const usersCount = await prisma.user.count();
  const taxCodesCount = await prisma.taxCode.count();
  const paymentTermsCount = await prisma.paymentTerm.count();
  const uomCount = await prisma.uom.count();
  const warehouseCount = await prisma.warehouse.count();

  console.log(`✓ Roles: ${rolesCount}`);
  console.log(`✓ Permissions: ${permissionsCount}`);
  console.log(`✓ Users: ${usersCount}`);
  console.log(`✓ Tax Codes: ${taxCodesCount}`);
  console.log(`✓ Payment Terms: ${paymentTermsCount}`);
  console.log(`✓ UOM: ${uomCount}`);
  console.log(`✓ Warehouses: ${warehouseCount}`);

  console.log('\n=== 3. TESTING END-TO-END ERP WORKFLOW IN DATABASE ===');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@eddva.com' } });
  if (!admin) throw new Error('Admin user not found in database.');

  const tax18 = await prisma.taxCode.findFirst({ where: { name: 'GST 18%' } });
  const pcsUom = await prisma.uom.findUnique({ where: { code: 'PCS' } });
  const net30 = await prisma.paymentTerm.findUnique({ where: { termName: 'Net 30' } });
  const mainWh = await prisma.warehouse.findFirst({ where: { isDefault: true } });

  let category = await prisma.itemCategory.findFirst({ where: { categoryName: 'Test Category' } });
  if (!category) {
    category = await prisma.itemCategory.create({
      data: { categoryName: 'Test Category' },
    });
  }

  // Create Test Item
  let item = await prisma.item.findUnique({ where: { itemCode: 'TEST-ITEM-01' } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        itemCode: 'TEST-ITEM-01',
        itemName: 'Test Industrial Steel Plate',
        categoryId: category.id,
        uomId: pcsUom!.id,
        hsnSacCode: '7208',
        purchasePrice: 1000.0,
        salesPrice: 1500.0,
        taxCodeId: tax18!.id,
      },
    });
  }
  console.log(`✓ Item Created/Verified: ${item.itemName} (${item.itemCode})`);

  // Create Test Vendor
  let vendor = await prisma.vendor.findFirst({ where: { vendorName: 'Test Vendor Supplies Pvt Ltd' } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        vendorCode: 'VEND-99999',
        vendorName: 'Test Vendor Supplies Pvt Ltd',
        gstin: '27AAAAA1234A1Z1',
        addressLine1: 'Industrial Estate Block 4',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400001',
        paymentTermId: net30!.id,
        creditLimit: 500000,
      },
    });
  }
  console.log(`✓ Vendor Created/Verified: ${vendor.vendorName} (${vendor.vendorCode})`);

  // Create Test Customer
  let customer = await prisma.customer.findFirst({ where: { customerName: 'Test Customer Client Ltd' } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        customerCode: 'CUST-99999',
        customerName: 'Test Customer Client Ltd',
        gstin: '27BBBBB5678B1Z2',
        addressLine1: 'Corporate Park Building A',
        city: 'Pune',
        state: 'Maharashtra',
        pincode: '411001',
        paymentTermId: net30!.id,
        creditLimit: 1000000,
      },
    });
  }
  console.log(`✓ Customer Created/Verified: ${customer.customerName} (${customer.customerCode})`);

  // 4. Test Purchase Order & Approval
  const poNumber = `PO/2026-27/TEST-${Date.now().toString().slice(-4)}`;
  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      vendorId: vendor.id,
      poDate: new Date(),
      expectedDeliveryDate: new Date(Date.now() + 864000000),
      warehouseId: mainWh!.id,
      subtotal: 10000,
      taxAmount: 1800,
      discount: 0,
      grandTotal: 11800,
      status: PoStatus.APPROVED,
      createdBy: admin.id,
      approvedBy: admin.id,
      items: {
        create: [
          {
            itemId: item.id,
            quantity: 10,
            unitPrice: 1000,
            taxCodeId: tax18!.id,
            lineTotal: 11800,
          },
        ],
      },
    },
    include: { items: true },
  });
  console.log(`✓ Purchase Order Created & Approved: ${po.poNumber} Total: ₹${po.grandTotal}`);

  // 5. Test GRN Confirmation
  const grnNumber = `GRN/2026-27/TEST-${Date.now().toString().slice(-4)}`;
  const grn = await prisma.goodsReceiptNote.create({
    data: {
      grnNumber,
      poId: po.id,
      vendorId: vendor.id,
      receivedDate: new Date(),
      warehouseId: mainWh!.id,
      status: GrnStatus.CONFIRMED,
      createdBy: admin.id,
      items: {
        create: [
          {
            poItemId: po.items[0].id,
            itemId: item.id,
            receivedQty: 10,
            acceptedQty: 10,
            rejectedQty: 0,
          },
        ],
      },
    },
  });
  console.log(`✓ GRN Created & Confirmed: ${grn.grnNumber}`);

  // 6. Test Purchase Invoice & Posting
  const piNumber = `PI/2026-27/TEST-${Date.now().toString().slice(-4)}`;
  const purchaseInvoice = await prisma.purchaseInvoice.create({
    data: {
      invoiceNumber: piNumber,
      vendorInvoiceNumber: 'INV-VENDOR-TEST-101',
      vendorId: vendor.id,
      poId: po.id,
      grnId: grn.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      subtotal: 10000,
      taxAmount: 1800,
      discount: 0,
      grandTotal: 11800,
      paymentStatus: PaymentStatus.UNPAID,
      status: InvoiceStatus.POSTED,
      createdBy: admin.id,
      postedBy: admin.id,
      postedAt: new Date(),
      items: {
        create: [
          {
            itemId: item.id,
            quantity: 10,
            unitPrice: 1000,
            taxCodeId: tax18!.id,
            cgstAmount: 900,
            sgstAmount: 900,
            igstAmount: 0,
            lineTotal: 11800,
          },
        ],
      },
    },
  });
  console.log(`✓ Purchase Invoice Created & Posted: ${purchaseInvoice.invoiceNumber}`);

  // 7. Test Purchase Payment
  const payment = await prisma.purchasePayment.create({
    data: {
      paymentNumber: `PAYMENT/2026-27/TEST-${Date.now().toString().slice(-4)}`,
      purchaseInvoiceId: purchaseInvoice.id,
      paymentDate: new Date(),
      amount: 11800,
      mode: PaymentMode.BANK_TRANSFER,
      referenceNo: 'BANK-REF-998877',
      createdBy: admin.id,
    },
  });

  await prisma.purchaseInvoice.update({
    where: { id: purchaseInvoice.id },
    data: { paymentStatus: PaymentStatus.PAID },
  });
  console.log(`✓ Purchase Payment Recorded & Invoice Status set to PAID: ${payment.paymentNumber}`);

  // 8. Test Sales Order & Invoice
  const soNumber = `SO/2026-27/TEST-${Date.now().toString().slice(-4)}`;
  const so = await prisma.salesOrder.create({
    data: {
      soNumber,
      customerId: customer.id,
      soDate: new Date(),
      deliveryDate: new Date(Date.now() + 864000000),
      subtotal: 15000,
      taxAmount: 2700,
      discount: 0,
      grandTotal: 17700,
      status: SoStatus.CONFIRMED,
      createdBy: admin.id,
      items: {
        create: [
          {
            itemId: item.id,
            quantity: 10,
            unitPrice: 1500,
            taxCodeId: tax18!.id,
            lineTotal: 17700,
          },
        ],
      },
    },
  });

  const siNumber = `SI/2026-27/TEST-${Date.now().toString().slice(-4)}`;
  const salesInvoice = await prisma.salesInvoice.create({
    data: {
      invoiceNumber: siNumber,
      customerId: customer.id,
      soId: so.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 86400000),
      subtotal: 15000,
      taxAmount: 2700,
      discount: 0,
      grandTotal: 17700,
      paymentStatus: PaymentStatus.PAID,
      status: InvoiceStatus.POSTED,
      createdBy: admin.id,
      postedBy: admin.id,
      postedAt: new Date(),
      items: {
        create: [
          {
            itemId: item.id,
            quantity: 10,
            unitPrice: 1500,
            taxCodeId: tax18!.id,
            cgstAmount: 1350,
            sgstAmount: 1350,
            igstAmount: 0,
            lineTotal: 17700,
          },
        ],
      },
    },
  });

  const receipt = await prisma.salesReceipt.create({
    data: {
      receiptNumber: `RECEIPT/2026-27/TEST-${Date.now().toString().slice(-4)}`,
      salesInvoiceId: salesInvoice.id,
      receiptDate: new Date(),
      amount: 17700,
      mode: PaymentMode.UPI,
      referenceNo: 'UPI-REF-112233',
      createdBy: admin.id,
    },
  });
  console.log(`✓ Sales Order, Invoice & Receipt Verified: ${siNumber} Total: ₹${salesInvoice.grandTotal}`);

  console.log('\n=== ALL DATABASE OPERATIONS & RELATIONSHIPS ARE WORKING PERFECTLY! ===\n');
}

verifyDatabase()
  .catch((err) => {
    console.error('❌ Database verification failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

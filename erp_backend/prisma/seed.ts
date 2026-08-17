import {
  PrismaClient,
  DocumentType,
  PoStatus,
  GrnStatus,
  SoStatus,
  InvoiceStatus,
  PaymentStatus,
  VendorStatus,
  Status,
  InventoryTransactionType,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding System Permissions ---');

  const permissionsData = [
    // Sales Permissions
    { key: 'sales.dashboard.view', desc: 'View Sales Dashboard & Overview' },
    { key: 'sales.customer.view', desc: 'View Customers Directory & Details' },
    { key: 'sales.customer.create', desc: 'Create New Customer Record' },
    { key: 'sales.customer.update', desc: 'Update Customer Information' },
    { key: 'sales.order.view', desc: 'View Sales Orders' },
    { key: 'sales.order.create', desc: 'Create Sales Order' },
    { key: 'sales.order.update', desc: 'Update Sales Order' },
    { key: 'sales.order.cancel', desc: 'Cancel Sales Order' },
    { key: 'sales.invoice.view', desc: 'View Sales Invoices & Register' },
    { key: 'sales.invoice.create', desc: 'Create & Post Sales Invoice' },
    { key: 'sales.receipt.view', desc: 'View Sales Payment Receipts' },
    { key: 'sales.receipt.create', desc: 'Record Customer Receipt Payment' },
    { key: 'sales.report.view', desc: 'View Sales Financial Reports' },

    // Purchase Permissions
    { key: 'purchase.dashboard.view', desc: 'View Purchase Dashboard & Overview' },
    { key: 'purchase.vendor.view', desc: 'View Vendors Directory & Profiles' },
    { key: 'purchase.vendor.create', desc: 'Create New Vendor Record' },
    { key: 'purchase.vendor.update', desc: 'Update Vendor Profile' },
    { key: 'purchase.po.view', desc: 'View Purchase Orders' },
    { key: 'purchase.po.create', desc: 'Create Purchase Order' },
    { key: 'purchase.po.update', desc: 'Update Purchase Order' },
    { key: 'purchase.po.approve', desc: 'Approve Purchase Order' },
    { key: 'purchase.po.cancel', desc: 'Cancel Purchase Order' },
    { key: 'purchase.grn.view', desc: 'View Goods Receipt Notes (GRN)' },
    { key: 'purchase.grn.create', desc: 'Receive Stock & Create GRN' },
    { key: 'purchase.invoice.view', desc: 'View Purchase Invoices & AP Register' },
    { key: 'purchase.invoice.create', desc: 'Create Purchase Invoice' },
    { key: 'purchase.payment.view', desc: 'View Vendor AP Payments' },
    { key: 'purchase.payment.create', desc: 'Make Vendor Payment' },
    { key: 'purchase.report.view', desc: 'View Purchase Reports & Registers' },

    // Master Data Permissions
    { key: 'item.view', desc: 'View Item Master List' },
    { key: 'item.create', desc: 'Create Item Master Record' },
    { key: 'item.edit', desc: 'Edit Item Master Record' },

    // Institute Admin Permissions
    { key: 'institute_admin.users.view', desc: 'View Institute Users' },
    { key: 'institute_admin.users.manage', desc: 'Create, Edit & Manage Institute Users' },
    { key: 'institute_admin.roles.view', desc: 'View Dynamic Roles' },
    { key: 'institute_admin.roles.manage', desc: 'Create & Modify Dynamic Roles & Permissions' },
  ];

  for (const perm of permissionsData) {
    await prisma.permission.upsert({
      where: { permissionKey: perm.key },
      update: {
        description: perm.desc,
        isSystem: true,
      },
      create: {
        permissionKey: perm.key,
        description: perm.desc,
        isSystem: true,
      },
    });
  }

  console.log('✅ System Permissions seeded successfully!');

  console.log('--- Seeding Roles & Demo Accounts ---');
  const passwordHash = await bcrypt.hash('Password@123', 10);
  const instId = 'INST_DEMO_101';

  const allPerms = await prisma.permission.findMany();
  const permMap = new Map(allPerms.map((p) => [p.permissionKey, p.id]));

  const rolesConfig = [
    {
      name: 'Institute Administrator',
      desc: 'Full administrative access to all system features, applications, and settings',
      perms: allPerms.map((p) => p.permissionKey),
      user: { name: 'Institute Admin', email: 'admin@eddva.com' },
    },
    {
      name: 'Sales Manager',
      desc: 'Manages customers, sales orders, invoices, and sales reports',
      perms: allPerms
        .filter((p) => p.permissionKey.startsWith('sales.') || p.permissionKey.startsWith('item.'))
        .map((p) => p.permissionKey),
      user: { name: 'Sales Manager User', email: 'sales.mgr@eddva.com' },
    },
    {
      name: 'Purchase Manager',
      desc: 'Manages vendors, POs, GRNs, purchase invoices, and payments',
      perms: allPerms
        .filter((p) => p.permissionKey.startsWith('purchase.') || p.permissionKey.startsWith('item.'))
        .map((p) => p.permissionKey),
      user: { name: 'Purchase Manager User', email: 'purchase.mgr@eddva.com' },
    },
    {
      name: 'Operations Lead',
      desc: 'Access to Sales and Purchase applications',
      perms: allPerms
        .filter(
          (p) =>
            p.permissionKey.startsWith('sales.') ||
            p.permissionKey.startsWith('purchase.') ||
            p.permissionKey.startsWith('item.'),
        )
        .map((p) => p.permissionKey),
      user: { name: 'Operations Lead User', email: 'ops.lead@eddva.com' },
    },
  ];

  let adminUser: any = null;

  for (const rCfg of rolesConfig) {
    let role = await prisma.role.findFirst({
      where: { roleName: rCfg.name, instituteId: instId },
    });

    if (!role) {
      role = await prisma.role.create({
        data: {
          roleName: rCfg.name,
          description: rCfg.desc,
          instituteId: instId,
        },
      });
    }

    const permIds = rCfg.perms
      .map((key) => permMap.get(key))
      .filter(Boolean) as string[];

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (permIds.length > 0) {
      await prisma.rolePermission.createMany({
        data: permIds.map((pId) => ({
          roleId: role.id,
          permissionId: pId,
        })),
      });
    }

    const u = await prisma.user.upsert({
      where: { email: rCfg.user.email },
      update: {
        name: rCfg.user.name,
        roleId: role.id,
        instituteId: instId,
      },
      create: {
        name: rCfg.user.name,
        email: rCfg.user.email,
        passwordHash,
        instituteId: instId,
        roleId: role.id,
      },
    });

    if (rCfg.user.email === 'admin@eddva.com') {
      adminUser = u;
    }
  }

  console.log('✅ Roles and Users seeded successfully!');

  console.log('--- Seeding Master Data (1 Row Each) ---');

  // 1. Item Category
  let category = await prisma.itemCategory.findFirst({ where: { categoryName: 'Electronics & Hardware' } });
  if (!category) {
    category = await prisma.itemCategory.create({
      data: {
        categoryName: 'Electronics & Hardware',
        instituteId: instId,
        status: Status.ACTIVE,
      },
    });
  }

  // 2. Unit of Measure (UOM)
  let uom = await prisma.uom.findFirst({ where: { code: 'PCS' } });
  if (!uom) {
    uom = await prisma.uom.create({
      data: {
        code: 'PCS',
        name: 'Pieces',
        status: Status.ACTIVE,
      },
    });
  }

  // 3. Tax Code
  let taxCode = await prisma.taxCode.findFirst({ where: { name: 'GST 18%' } });
  if (!taxCode) {
    taxCode = await prisma.taxCode.create({
      data: {
        name: 'GST 18%',
        cgstPct: 9.0,
        sgstPct: 9.0,
        igstPct: 18.0,
        effectiveFrom: new Date(),
        status: Status.ACTIVE,
      },
    });
  }

  // 4. Payment Term
  let paymentTerm = await prisma.paymentTerm.findFirst({ where: { termName: 'Net 30 Days' } });
  if (!paymentTerm) {
    paymentTerm = await prisma.paymentTerm.create({
      data: {
        termName: 'Net 30 Days',
        days: 30,
        status: Status.ACTIVE,
      },
    });
  }

  // 5. Warehouse
  let warehouse = await prisma.warehouse.findFirst({ where: { name: 'Central Main Warehouse' } });
  if (!warehouse) {
    warehouse = await prisma.warehouse.create({
      data: {
        name: 'Central Main Warehouse',
        address: '100 Technology Parkway, Building A, San Jose, CA',
        isDefault: true,
        instituteId: instId,
        status: Status.ACTIVE,
      },
    });
  }

  // 6. Item Master
  let item = await prisma.item.findFirst({ where: { itemCode: 'SKU-MON-27' } });
  if (!item) {
    item = await prisma.item.create({
      data: {
        itemCode: 'SKU-MON-27',
        itemName: 'Dell UltraSharp 27" 4K Monitor',
        categoryId: category.id,
        uomId: uom.id,
        hsnSacCode: '84713010',
        purchasePrice: 250.0,
        salesPrice: 350.0,
        taxCodeId: taxCode.id,
        quantity: 50.0,
        instituteId: instId,
        status: Status.ACTIVE,
      },
    });
  }

  // 7. Vendor (with Contact & Bank Detail)
  let vendor = await prisma.vendor.findFirst({ where: { vendorCode: 'VEND-TECH-01' } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        vendorCode: 'VEND-TECH-01',
        vendorName: 'Tech Supplies Global Pvt Ltd',
        gstin: '27AAACT1234F1Z1',
        taxId: 'TAX-VEND-9988',
        addressLine1: '100 Technology Parkway',
        city: 'San Jose',
        state: 'CA',
        pincode: '95110',
        paymentTermId: paymentTerm.id,
        creditLimit: 50000.0,
        status: VendorStatus.ACTIVE,
        instituteId: instId,
        contacts: {
          create: {
            name: 'John Doe',
            designation: 'Account Manager',
            email: 'johndoe@techsupplies.com',
            phone: '+1-555-0144',
          },
        },
        bankDetails: {
          create: {
            accountNo: '9876543210',
            ifsc: 'SVBKUS6S',
            swift: 'SVBKUS6SXXX',
            bankName: 'Silicon Valley Bank',
            isPrimary: true,
          },
        },
      },
    });
  }

  // 8. Customer (with Contact)
  let customer = await prisma.customer.findFirst({ where: { customerCode: 'CUST-ACME-01' } });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        customerCode: 'CUST-ACME-01',
        customerName: 'Acme Educational Academy',
        gstin: '27AABCA5678G1Z2',
        addressLine1: '500 Innovation Way',
        city: 'Boston',
        state: 'MA',
        pincode: '02108',
        paymentTermId: paymentTerm.id,
        creditLimit: 25000.0,
        status: Status.ACTIVE,
        instituteId: instId,
        contacts: {
          create: {
            name: 'Jane Smith',
            designation: 'Procurement Officer',
            email: 'janesmith@acmeacademy.edu',
            phone: '+1-555-0188',
          },
        },
      },
    });
  }

  console.log('✅ Master Data, Vendor & Customer seeded successfully!');

  console.log('--- Seeding Purchase Workflow Data (1 Row Each) ---');

  // 9. Number Sequences
  const docTypes = [
    { type: DocumentType.PO, prefix: 'PO/2026-27/' },
    { type: DocumentType.GRN, prefix: 'GRN/2026-27/' },
    { type: DocumentType.PURCHASE_INVOICE, prefix: 'PI/2026-27/' },
    { type: DocumentType.SALES_ORDER, prefix: 'SO/2026-27/' },
    { type: DocumentType.SALES_INVOICE, prefix: 'SI/2026-27/' },
    { type: DocumentType.PAYMENT, prefix: 'PAYMENT/2026-27/' },
    { type: DocumentType.RECEIPT, prefix: 'RECEIPT/2026-27/' },
  ];

  for (const dt of docTypes) {
    await prisma.numberSequence.upsert({
      where: {
        documentType_financialYear: {
          documentType: dt.type,
          financialYear: '2026-27',
        },
      },
      update: {},
      create: {
        documentType: dt.type,
        financialYear: '2026-27',
        prefix: dt.prefix,
        currentNumber: 1,
      },
    });
  }

  // 10. Purchase Order
  let po = await prisma.purchaseOrder.findFirst({
    where: { poNumber: 'PO/2026-27/0001' },
    include: { items: true },
  });
  if (!po) {
    po = await prisma.purchaseOrder.create({
      data: {
        poNumber: 'PO/2026-27/0001',
        vendorId: vendor.id,
        poDate: new Date(),
        expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        warehouseId: warehouse.id,
        status: PoStatus.APPROVED,
        subtotal: 2500.0,
        taxAmount: 450.0,
        discount: 0.0,
        grandTotal: 2950.0,
        createdBy: adminUser.id,
        approvedBy: adminUser.id,
        instituteId: instId,
        items: {
          create: [
            {
              itemId: item.id,
              quantity: 10,
              unitPrice: 250.0,
              taxCodeId: taxCode.id,
              lineTotal: 2950.0,
              receivedQty: 10,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  // 11. Goods Receipt Note (GRN)
  let grn = await prisma.goodsReceiptNote.findFirst({ where: { grnNumber: 'GRN/2026-27/0001' } });
  if (!grn) {
    grn = await prisma.goodsReceiptNote.create({
      data: {
        grnNumber: 'GRN/2026-27/0001',
        poId: po.id,
        vendorId: vendor.id,
        receivedDate: new Date(),
        warehouseId: warehouse.id,
        status: GrnStatus.CONFIRMED,
        createdBy: adminUser.id,
        instituteId: instId,
        items: {
          create: [
            {
              poItemId: po.items[0].id,
              itemId: item.id,
              receivedQty: 10,
              acceptedQty: 9,
              rejectedQty: 1,
            },
          ],
        },
      },
    });
  }

  // 12. Purchase Invoice
  let pi = await prisma.purchaseInvoice.findFirst({ where: { invoiceNumber: 'PI/2026-27/0001' } });
  if (!pi) {
    pi = await prisma.purchaseInvoice.create({
      data: {
        invoiceNumber: 'PI/2026-27/0001',
        vendorInvoiceNumber: 'INV-TECH-8899',
        vendorId: vendor.id,
        poId: po.id,
        grnId: grn.id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: 2250.0,
        taxAmount: 405.0,
        discount: 0.0,
        grandTotal: 2655.0,
        paymentStatus: PaymentStatus.PAID,
        status: InvoiceStatus.POSTED,
        createdBy: adminUser.id,
        postedBy: adminUser.id,
        postedAt: new Date(),
        instituteId: instId,
        items: {
          create: [
            {
              itemId: item.id,
              quantity: 9,
              unitPrice: 250.0,
              taxCodeId: taxCode.id,
              cgstAmount: 202.5,
              sgstAmount: 202.5,
              igstAmount: 0.0,
              lineTotal: 2655.0,
            },
          ],
        },
      },
    });
  }

  // 13. Purchase Payment
  let purchasePayment = await prisma.purchasePayment.findFirst({ where: { paymentNumber: 'PAYMENT/2026-27/0001' } });
  if (!purchasePayment) {
    purchasePayment = await prisma.purchasePayment.create({
      data: {
        paymentNumber: 'PAYMENT/2026-27/0001',
        purchaseInvoiceId: pi.id,
        paymentDate: new Date(),
        amount: 2655.0,
        mode: 'BANK_TRANSFER' as any,
        referenceNo: 'TXN-BANK-998877',
        createdBy: adminUser.id,
        instituteId: instId,
      },
    });
  }

  console.log('✅ Purchase Workflow Data seeded successfully!');

  console.log('--- Seeding Sales Workflow Data (1 Row Each) ---');

  // 14. Sales Order
  let so = await prisma.salesOrder.findFirst({ where: { soNumber: 'SO/2026-27/0001' } });
  if (!so) {
    so = await prisma.salesOrder.create({
      data: {
        soNumber: 'SO/2026-27/0001',
        customerId: customer.id,
        soDate: new Date(),
        deliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        status: SoStatus.CONFIRMED,
        subtotal: 1750.0,
        taxAmount: 315.0,
        discount: 0.0,
        grandTotal: 2065.0,
        createdBy: adminUser.id,
        instituteId: instId,
        items: {
          create: [
            {
              itemId: item.id,
              quantity: 5,
              unitPrice: 350.0,
              taxCodeId: taxCode.id,
              lineTotal: 2065.0,
              invoicedQty: 5,
            },
          ],
        },
      },
      include: { items: true },
    });
  }

  // 15. Sales Invoice
  let si = await prisma.salesInvoice.findFirst({ where: { invoiceNumber: 'SI/2026-27/0001' } });
  if (!si) {
    si = await prisma.salesInvoice.create({
      data: {
        invoiceNumber: 'SI/2026-27/0001',
        customerId: customer.id,
        soId: so.id,
        invoiceDate: new Date(),
        dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        subtotal: 1750.0,
        taxAmount: 315.0,
        discount: 0.0,
        grandTotal: 2065.0,
        paymentStatus: PaymentStatus.PAID,
        status: InvoiceStatus.POSTED,
        createdBy: adminUser.id,
        postedBy: adminUser.id,
        postedAt: new Date(),
        instituteId: instId,
        items: {
          create: [
            {
              itemId: item.id,
              quantity: 5,
              unitPrice: 350.0,
              taxCodeId: taxCode.id,
              cgstAmount: 157.5,
              sgstAmount: 157.5,
              igstAmount: 0.0,
              lineTotal: 2065.0,
            },
          ],
        },
      },
    });
  }

  // 16. Sales Receipt
  let salesReceipt = await prisma.salesReceipt.findFirst({ where: { receiptNumber: 'RECEIPT/2026-27/0001' } });
  if (!salesReceipt) {
    salesReceipt = await prisma.salesReceipt.create({
      data: {
        receiptNumber: 'RECEIPT/2026-27/0001',
        salesInvoiceId: si.id,
        receiptDate: new Date(),
        amount: 2065.0,
        mode: 'BANK_TRANSFER' as any,
        referenceNo: 'RECPT-BANK-112233',
        createdBy: adminUser.id,
        instituteId: instId,
      },
    });
  }

  // 17. Inventory Transaction
  let invTxn = await prisma.inventoryTransaction.findFirst({ where: { documentNumber: 'GRN/2026-27/0001' } });
  if (!invTxn) {
    invTxn = await prisma.inventoryTransaction.create({
      data: {
        itemId: item.id,
        warehouseId: warehouse.id,
        transactionType: InventoryTransactionType.PURCHASE_GRN,
        referenceType: 'GRN',
        referenceId: grn.id,
        documentNumber: grn.grnNumber,
        quantityIn: 9,
        quantityOut: 0,
        balanceQuantity: 50,
        remarks: 'Stock received via GRN GRN/2026-27/0001',
        createdBy: adminUser.id,
        instituteId: instId,
      },
    });
  }

  // 18. Audit Log
  let auditLog = await prisma.auditLog.findFirst({ where: { entityType: 'PurchaseOrder' } });
  if (!auditLog) {
    await prisma.auditLog.create({
      data: {
        userId: adminUser.id,
        entityType: 'PurchaseOrder',
        entityId: po.id,
        action: 'Purchase Order Approved',
        metadata: { poNumber: po.poNumber, grandTotal: po.grandTotal },
      },
    });
  }

  console.log('✅ Sales Workflow Data & Inventory Transactions seeded successfully!');

  // ==========================================
  // CANTEEN SEEDING
  // ==========================================
  console.log('--- Seeding Canteen Permissions & Roles ---');

  const canteenPermsData = [
    // Role & Permission Management
    { key: 'canteen.role.view', name: 'View Canteen Roles', desc: 'View Canteen dynamic roles' },
    { key: 'canteen.role.create', name: 'Create Canteen Role', desc: 'Create new Canteen role' },
    { key: 'canteen.role.update', name: 'Update Canteen Role', desc: 'Update Canteen role details' },
    { key: 'canteen.role.delete', name: 'Delete Canteen Role', desc: 'Delete Canteen role' },
    { key: 'canteen.role.assign', name: 'Assign Canteen Role', desc: 'Assign Canteen role to users' },
    { key: 'canteen.role.remove', name: 'Remove Canteen Role', desc: 'Remove Canteen role from users' },

    { key: 'canteen.permission.view', name: 'View Canteen Permissions', desc: 'View Canteen permission catalog' },
    { key: 'canteen.permission.create', name: 'Create Canteen Permission', desc: 'Create custom Canteen permission' },
    { key: 'canteen.permission.update', name: 'Update Canteen Permission', desc: 'Update custom Canteen permission' },
    { key: 'canteen.permission.delete', name: 'Delete Canteen Permission', desc: 'Delete custom Canteen permission' },

    // Menu Categories & Items & Schedules
    { key: 'canteen.category.view', name: 'View Categories', desc: 'View Canteen menu categories' },
    { key: 'canteen.category.create', name: 'Create Category', desc: 'Create menu category' },
    { key: 'canteen.category.update', name: 'Update Category', desc: 'Update menu category' },
    { key: 'canteen.category.delete', name: 'Delete Category', desc: 'Delete menu category' },

    { key: 'canteen.item.view', name: 'View Menu Items', desc: 'View Canteen menu items' },
    { key: 'canteen.item.create', name: 'Create Menu Item', desc: 'Create menu item' },
    { key: 'canteen.item.update', name: 'Update Menu Item', desc: 'Update menu item' },
    { key: 'canteen.item.delete', name: 'Delete Menu Item', desc: 'Delete menu item' },
    { key: 'canteen.item.availability', name: 'Toggle Item Availability', desc: 'Toggle availability of menu items' },

    { key: 'canteen.schedule.view', name: 'View Item Schedules', desc: 'View menu item schedules' },
    { key: 'canteen.schedule.create', name: 'Create Item Schedule', desc: 'Create menu item schedule' },
    { key: 'canteen.schedule.update', name: 'Update Item Schedule', desc: 'Update menu item schedule' },
    { key: 'canteen.schedule.delete', name: 'Delete Item Schedule', desc: 'Delete menu item schedule' },

    // Members
    { key: 'canteen.member.view', name: 'View Members', desc: 'View Canteen members directory' },
    { key: 'canteen.member.create', name: 'Create Member', desc: 'Register new Canteen member' },
    { key: 'canteen.member.update', name: 'Update Member', desc: 'Update Canteen member profile' },
    { key: 'canteen.member.delete', name: 'Delete Member', desc: 'Delete Canteen member profile' },
    { key: 'canteen.member.barcode_lookup', name: 'Barcode Lookup', desc: 'Lookup member profile by barcode' },

    // POS Terminals & Shifts
    { key: 'canteen.terminal.view', name: 'View POS Terminals', desc: 'View POS terminals' },
    { key: 'canteen.terminal.create', name: 'Create POS Terminal', desc: 'Register POS terminal' },
    { key: 'canteen.terminal.update', name: 'Update POS Terminal', desc: 'Update POS terminal' },
    { key: 'canteen.terminal.delete', name: 'Delete POS Terminal', desc: 'Delete POS terminal' },

    { key: 'canteen.shift.view', name: 'View POS Shifts', desc: 'View POS shifts and cash variance' },
    { key: 'canteen.shift.open', name: 'Open POS Shift', desc: 'Open POS terminal shift' },
    { key: 'canteen.shift.update', name: 'Update POS Shift', desc: 'Update POS shift details' },
    { key: 'canteen.shift.close', name: 'Close POS Shift', desc: 'Close POS shift and reconcile cash' },

    // Orders & Order Items
    { key: 'canteen.order.view', name: 'View Orders', desc: 'View Canteen orders' },
    { key: 'canteen.order.create', name: 'Create Order', desc: 'Create Canteen order' },
    { key: 'canteen.order.update', name: 'Update Order Status', desc: 'Update Canteen order status' },
    { key: 'canteen.order.cancel', name: 'Cancel Order', desc: 'Cancel Canteen order' },

    { key: 'canteen.order_item.view', name: 'View Order Items', desc: 'View Canteen order line items' },
    { key: 'canteen.order_item.create', name: 'Add Order Items', desc: 'Add items to order' },
    { key: 'canteen.order_item.update', name: 'Update Order Items', desc: 'Modify line items' },
    { key: 'canteen.order_item.delete', name: 'Delete Order Items', desc: 'Remove line items' },

    // Payments
    { key: 'canteen.payment.view', name: 'View Payments', desc: 'View payment transactions' },
    { key: 'canteen.payment.create', name: 'Record Payment', desc: 'Process payment for order' },
    { key: 'canteen.payment.update', name: 'Update Payment', desc: 'Update payment record' },
    { key: 'canteen.payment.refund', name: 'Refund Payment', desc: 'Process payment refund/reversal' },

    // Wallet & Top-ups & Ledger
    { key: 'canteen.wallet.view', name: 'View Wallets', desc: 'View student wallets & balance' },
    { key: 'canteen.wallet.create', name: 'Create Wallet', desc: 'Create student wallet' },
    { key: 'canteen.wallet.update', name: 'Update Wallet', desc: 'Update wallet parameters' },
    { key: 'canteen.wallet.delete', name: 'Delete Wallet', desc: 'Delete wallet' },
    { key: 'canteen.wallet.topup', name: 'Topup Wallet', desc: 'Add money to student wallet' },
    { key: 'canteen.wallet.block', name: 'Block Wallet', desc: 'Block student wallet' },
    { key: 'canteen.wallet.unblock', name: 'Unblock Wallet', desc: 'Unblock student wallet' },
    { key: 'canteen.wallet.transaction_view', name: 'View Wallet Ledger', desc: 'View wallet transaction history' },

    // Reports & Audit
    { key: 'canteen.report.sales', name: 'Sales Report', desc: 'View Canteen sales reports' },
    { key: 'canteen.report.item_sales', name: 'Item Sales Report', desc: 'View item-level sales report' },
    { key: 'canteen.report.category_sales', name: 'Category Sales Report', desc: 'View category sales report' },
    { key: 'canteen.report.payment_summary', name: 'Payment Summary', desc: 'View payment mode summary' },
    { key: 'canteen.report.shift', name: 'Shift Reports', desc: 'View POS shift reports' },
    { key: 'canteen.audit.view', name: 'View Audit Logs', desc: 'View Canteen audit log history' },
  ];

  for (const p of canteenPermsData) {
    await prisma.canteenPermission.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.desc, isSystem: true },
      create: { key: p.key, name: p.name, description: p.desc, isSystem: true },
    });
  }

  const allCanteenPerms = await prisma.canteenPermission.findMany();
  const canteenPermMap = new Map(allCanteenPerms.map((p) => [p.key, p.id]));

  // Create default roles
  const canteenAdminRole = await prisma.canteenRole.upsert({
    where: { name: 'CANTEEN_ADMIN' },
    update: { description: 'Full Canteen business operations (No RBAC management permissions)', isSystem: true },
    create: { name: 'CANTEEN_ADMIN', description: 'Full Canteen business operations (No RBAC management permissions)', isSystem: true },
  });

  const canteenManagerRole = await prisma.canteenRole.upsert({
    where: { name: 'CANTEEN_MANAGER' },
    update: { description: 'Manages menu, items, members, orders, shifts, payments, reports, and wallets', isSystem: true },
    create: { name: 'CANTEEN_MANAGER', description: 'Manages menu, items, members, orders, shifts, payments, reports, and wallets', isSystem: true },
  });

  const canteenCounterRole = await prisma.canteenRole.upsert({
    where: { name: 'CANTEEN_COUNTER_STAFF' },
    update: { description: 'Counter operations for terminal shifts, barcode lookup, order creation, payments, and wallet top-ups', isSystem: true },
    create: { name: 'CANTEEN_COUNTER_STAFF', description: 'Counter operations for terminal shifts, barcode lookup, order creation, payments, and wallet top-ups', isSystem: true },
  });

  // Assign business permissions to CANTEEN_ADMIN (excluding role.* and permission.*)
  const businessPermKeys = allCanteenPerms
    .filter((p) => !p.key.startsWith('canteen.role.') && !p.key.startsWith('canteen.permission.'))
    .map((p) => p.key);

  await prisma.canteenRolePermission.deleteMany({ where: { roleId: canteenAdminRole.id } });
  for (const k of businessPermKeys) {
    const pId = canteenPermMap.get(k);
    if (pId) {
      await prisma.canteenRolePermission.create({ data: { roleId: canteenAdminRole.id, permissionId: pId } });
    }
  }

  // Sample Category & Item
  const canteenCategory = await prisma.canteenMenuCategory.upsert({
    where: { name: 'Snacks & Beverages' },
    update: { displayOrder: 1 },
    create: { name: 'Snacks & Beverages', displayOrder: 1 },
  });

  const menuItem = await prisma.canteenMenuItem.upsert({
    where: { id: 'CANTEEN_ITEM_101' },
    update: { name: 'Classic Veg Burger', price: 80.0, categoryId: canteenCategory.id, foodType: 'VEG' },
    create: {
      id: 'CANTEEN_ITEM_101',
      categoryId: canteenCategory.id,
      name: 'Classic Veg Burger',
      description: 'Crispy veg patty with cheese and fresh veggies',
      price: 80.0,
      taxRate: 5.0,
      foodType: 'VEG',
      isAvailable: true,
    },
  });

  // Sample Member & Wallet
  const member = await prisma.canteenMember.upsert({
    where: { idCardBarcode: 'BC1001' },
    update: { name: 'Alex Student', memberType: 'STUDENT' },
    create: {
      id: 'MEMBER_1001',
      externalRefId: 'STU-1001',
      name: 'Alex Student',
      memberType: 'STUDENT',
      idCardBarcode: 'BC1001',
    },
  });

  await prisma.canteenWallet.upsert({
    where: { memberId: member.id },
    update: { balance: 500.0 },
    create: {
      memberId: member.id,
      balance: 500.0,
      status: 'ACTIVE',
      dailySpendLimit: 200.0,
    },
  });

  // Sample POS Terminal
  await prisma.canteenPosTerminal.upsert({
    where: { name: 'Counter 1 POS' },
    update: { location: 'Main Canteen Ground Floor' },
    create: { name: 'Counter 1 POS', location: 'Main Canteen Ground Floor' },
  });

  console.log('✅ Canteen Permissions, Roles & Demo Data seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Seeding System Permissions ---');

  const permissionsData = [
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

  console.log('--- Seeding Institute Administrator Role & Demo Account ---');
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
  ];

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

    await prisma.user.upsert({
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
  }

  console.log('✅ Institute Administrator Role and Demo Account seeded successfully!');

  // ==========================================
  // ACCOUNTS SEEDING
  // ==========================================
  console.log('--- Seeding Accounts Module (Voucher Types, Financial Year, Starter Chart of Accounts) ---');

  const voucherTypesData = [
    { code: 'JOURNAL', name: 'Journal Voucher', prefix: 'JRN-' },
    { code: 'PAYMENT', name: 'Payment Voucher', prefix: 'PMT-' },
    { code: 'RECEIPT', name: 'Receipt Voucher', prefix: 'RCT-' },
    { code: 'CONTRA', name: 'Contra Voucher', prefix: 'CTR-' },
  ];
  for (const vt of voucherTypesData) {
    await prisma.voucherType.upsert({
      where: { code: vt.code },
      update: { name: vt.name, prefix: vt.prefix },
      create: { code: vt.code, name: vt.name, prefix: vt.prefix },
    });
  }

  let fy2627 = await prisma.financialYear.findFirst({ where: { fyLabel: '2026-27', instituteId: instId } });
  if (!fy2627) {
    fy2627 = await prisma.financialYear.create({
      data: {
        fyLabel: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: new Date('2027-03-31'),
        instituteId: instId,
      },
    });
  }

  const groupDefs = [
    { key: 'CURRENT_ASSETS', name: 'Current Assets', nature: 'ASSET' as const, parent: null as string | null },
    { key: 'FIXED_ASSETS', name: 'Fixed Assets', nature: 'ASSET' as const, parent: null },
    { key: 'CURRENT_LIABILITIES', name: 'Current Liabilities', nature: 'LIABILITY' as const, parent: null },
    { key: 'CAPITAL', name: 'Capital & Reserves', nature: 'EQUITY' as const, parent: null },
    { key: 'INCOME', name: 'Income', nature: 'INCOME' as const, parent: null },
    { key: 'DIRECT_EXPENSES', name: 'Direct Expenses', nature: 'EXPENSE' as const, parent: null },
    { key: 'INDIRECT_EXPENSES', name: 'Indirect Expenses', nature: 'EXPENSE' as const, parent: null },
  ];
  const groupIdByKey = new Map<string, string>();
  for (const g of groupDefs) {
    let group = await prisma.accountGroup.findFirst({ where: { groupName: g.name, instituteId: instId } });
    if (!group) {
      group = await prisma.accountGroup.create({ data: { groupName: g.name, nature: g.nature, instituteId: instId } });
    }
    groupIdByKey.set(g.key, group.id);
  }

  const ledgerAccountDefs = [
    { code: 'CASH-001', name: 'Cash in Hand', group: 'CURRENT_ASSETS', isCash: true, isBank: false },
    { code: 'BANK-001', name: 'Bank Account - Main', group: 'CURRENT_ASSETS', isCash: false, isBank: true },
    { code: 'AR-001', name: 'Accounts Receivable', group: 'CURRENT_ASSETS', isCash: false, isBank: false },
    { code: 'AP-001', name: 'Accounts Payable', group: 'CURRENT_LIABILITIES', isCash: false, isBank: false },
    { code: 'CAP-001', name: "Owner's Capital", group: 'CAPITAL', isCash: false, isBank: false },
    { code: 'INC-001', name: 'Sales Income', group: 'INCOME', isCash: false, isBank: false },
    { code: 'EXP-001', name: 'Purchase Expense', group: 'DIRECT_EXPENSES', isCash: false, isBank: false },
    { code: 'EXP-002', name: 'Office Expenses', group: 'INDIRECT_EXPENSES', isCash: false, isBank: false },
  ];
  const accountIdByCode = new Map<string, string>();
  for (const a of ledgerAccountDefs) {
    let account = await prisma.ledgerAccount.findFirst({ where: { accountCode: a.code, instituteId: instId } });
    if (!account) {
      account = await prisma.ledgerAccount.create({
        data: {
          accountCode: a.code,
          accountName: a.name,
          groupId: groupIdByKey.get(a.group)!,
          instituteId: instId,
          isCashAccount: a.isCash,
          isBankAccount: a.isBank,
        },
      });
    }
    accountIdByCode.set(a.code, account.id);
  }

  const mappingDefs = [
    { key: 'AR', code: 'AR-001' },
    { key: 'AP', code: 'AP-001' },
    { key: 'SALES_INCOME', code: 'INC-001' },
    { key: 'PURCHASE_EXPENSE', code: 'EXP-001' },
    { key: 'CASH', code: 'CASH-001' },
    { key: 'BANK', code: 'BANK-001' },
  ];
  for (const m of mappingDefs) {
    await prisma.accountMapping.upsert({
      where: { instituteId_mappingKey: { instituteId: instId, mappingKey: m.key } },
      update: { accountId: accountIdByCode.get(m.code)! },
      create: { instituteId: instId, mappingKey: m.key, accountId: accountIdByCode.get(m.code)! },
    });
  }

  // Accounts dynamic RBAC (same architecture as Library/Sports/Front Office/Inventory/Transport)
  const accountsFinanceAdminPermissions = [
    { resource: 'coa', actions: ['read', 'create', 'update'] },
    { resource: 'cost_centers', actions: ['read', 'create', 'update'] },
    { resource: 'financial_years', actions: ['read', 'create', 'close'] },
    { resource: 'vouchers', actions: ['read', 'create', 'update', 'post', 'cancel'] },
    { resource: 'ledger', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'attachments', actions: ['read', 'manage'] },
    { resource: 'mappings', actions: ['manage'] },
  ];
  const accountsFinanceAdminRole = await prisma.accountsDynamicRole.upsert({
    where: { institute_id_name: { institute_id: instId, name: 'Finance Admin' } },
    update: { permissions: accountsFinanceAdminPermissions },
    create: {
      institute_id: instId,
      name: 'Finance Admin',
      description: 'Full access to Chart of Accounts, Vouchers, Ledger, Reports, and Financial Year closing',
      permissions: accountsFinanceAdminPermissions,
    },
  });

  const accountsDemoPasswordHash = await bcrypt.hash('Accountant#2026', 10);
  await prisma.accountsUserDynamicRole.upsert({
    where: { institute_id_eddva_user_id: { institute_id: instId, eddva_user_id: 'usr_accountant_demo' } },
    update: { role_id: accountsFinanceAdminRole.role_id },
    create: {
      institute_id: instId,
      eddva_user_id: 'usr_accountant_demo',
      user_name: 'Demo Accountant',
      user_email: 'accountant.demo@eddva.com',
      username: 'accountant_demo',
      password_hash: accountsDemoPasswordHash,
      role_id: accountsFinanceAdminRole.role_id,
    },
  });

  console.log('✅ Accounts Module (Voucher Types, Financial Year, Starter Chart of Accounts, Mappings, Dynamic RBAC) seeded successfully!');

  // ==========================================
  // CANTEEN SEEDING
  // ==========================================
  console.log('--- Seeding Canteen Demo Data ---');

  // Sample Category & Item
  const canteenCategory = await prisma.canteenMenuCategory.upsert({
    where: { name: 'Snacks & Beverages' },
    update: { displayOrder: 1 },
    create: { name: 'Snacks & Beverages', displayOrder: 1 },
  });

  await prisma.canteenMenuItem.upsert({
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

  // Canteen dynamic RBAC (same architecture as Sales & Purchase)
  const canteenManagerPermissions = [
    { resource: 'menu_categories', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'menu_items', actions: ['read', 'create', 'update', 'delete', 'availability'] },
    { resource: 'menu_schedules', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'members', actions: ['read', 'create', 'update', 'delete', 'barcode_lookup'] },
    { resource: 'pos_terminals', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'pos_shifts', actions: ['read', 'open', 'close'] },
    { resource: 'orders', actions: ['read', 'create', 'update', 'cancel'] },
    { resource: 'order_items', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'payments', actions: ['read', 'create', 'refund'] },
    { resource: 'wallets', actions: ['read', 'create', 'update', 'delete', 'topup', 'block', 'unblock'] },
    { resource: 'wallet_transactions', actions: ['read'] },
    { resource: 'reports', actions: ['read'] },
  ];
  const canteenCounterStaffPermissions = [
    { resource: 'menu_categories', actions: ['read'] },
    { resource: 'menu_items', actions: ['read'] },
    { resource: 'members', actions: ['read', 'barcode_lookup'] },
    { resource: 'pos_terminals', actions: ['read'] },
    { resource: 'pos_shifts', actions: ['read', 'open', 'close'] },
    { resource: 'orders', actions: ['read', 'create', 'update'] },
    { resource: 'order_items', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'payments', actions: ['read', 'create'] },
    { resource: 'wallets', actions: ['read', 'topup'] },
    { resource: 'wallet_transactions', actions: ['read'] },
  ];
  const canteenManagerRole = await prisma.canteenDynamicRole.upsert({
    where: { institute_id_name: { institute_id: instId, name: 'Canteen Manager' } },
    update: { permissions: canteenManagerPermissions },
    create: {
      institute_id: instId,
      name: 'Canteen Manager',
      description: 'Full access to menu, members, POS, orders, payments, wallets, and reports',
      permissions: canteenManagerPermissions,
    },
  });
  await prisma.canteenDynamicRole.upsert({
    where: { institute_id_name: { institute_id: instId, name: 'Counter Staff' } },
    update: { permissions: canteenCounterStaffPermissions },
    create: {
      institute_id: instId,
      name: 'Counter Staff',
      description: 'Runs a POS terminal: opens shifts, looks up members, takes orders and payments, tops up wallets',
      permissions: canteenCounterStaffPermissions,
    },
  });

  const canteenDemoPasswordHash = await bcrypt.hash('Canteen#2026', 10);
  await prisma.canteenUserDynamicRole.upsert({
    where: { institute_id_eddva_user_id: { institute_id: instId, eddva_user_id: 'usr_canteen_manager_demo' } },
    update: { role_id: canteenManagerRole.role_id, password_hash: canteenDemoPasswordHash },
    create: {
      institute_id: instId,
      eddva_user_id: 'usr_canteen_manager_demo',
      user_name: 'Demo Canteen Manager',
      user_email: 'canteen.manager.demo@eddva.com',
      username: 'canteen_manager_demo',
      password_hash: canteenDemoPasswordHash,
      role_id: canteenManagerRole.role_id,
    },
  });

  console.log('✅ Canteen Demo Data & Dynamic RBAC seeded successfully!');

  // ==========================================
  // SALES & PURCHASE MODULE SEEDING
  // ==========================================
  console.log('--- Seeding Sales & Purchase Module (Masters, Demo Vendors/Customers/Items, Dynamic RBAC) ---');

  const spCategoryDefs = ['Electronics', 'Stationery', 'Furniture'];
  const spCategoryIdByName = new Map<string, number>();
  for (const name of spCategoryDefs) {
    const category = await prisma.spItemCategory.upsert({
      where: { institute_id_name: { institute_id: instId, name } },
      update: {},
      create: { institute_id: instId, name },
    });
    spCategoryIdByName.set(name, category.category_id);
  }

  const spUomDefs = [{ name: 'Piece', symbol: 'pc' }, { name: 'Box', symbol: 'box' }];
  const spUomIdByName = new Map<string, number>();
  for (const u of spUomDefs) {
    const uom = await prisma.spUom.upsert({
      where: { institute_id_name: { institute_id: instId, name: u.name } },
      update: {},
      create: { institute_id: instId, name: u.name, symbol: u.symbol },
    });
    spUomIdByName.set(u.name, uom.uom_id);
  }

  const spTaxCodeDefs = [
    { name: 'GST 0%', cgst_pct: 0, sgst_pct: 0, igst_pct: 0 },
    { name: 'GST 5%', cgst_pct: 2.5, sgst_pct: 2.5, igst_pct: 0 },
    { name: 'GST 12%', cgst_pct: 6, sgst_pct: 6, igst_pct: 0 },
    { name: 'GST 18%', cgst_pct: 9, sgst_pct: 9, igst_pct: 0 },
    { name: 'GST 28%', cgst_pct: 14, sgst_pct: 14, igst_pct: 0 },
  ];
  const spTaxCodeIdByName = new Map<string, number>();
  for (const t of spTaxCodeDefs) {
    let taxCode = await prisma.spTaxCode.findFirst({ where: { institute_id: instId, name: t.name } });
    if (!taxCode) {
      taxCode = await prisma.spTaxCode.create({
        data: { institute_id: instId, name: t.name, cgst_pct: t.cgst_pct, sgst_pct: t.sgst_pct, igst_pct: t.igst_pct, effective_from: new Date('2026-04-01') },
      });
    }
    spTaxCodeIdByName.set(t.name, taxCode.tax_code_id);
  }

  const spPaymentTermDefs = [
    { term_name: 'COD', days: 0 },
    { term_name: 'Net 15', days: 15 },
    { term_name: 'Net 30', days: 30 },
    { term_name: 'Net 60', days: 60 },
  ];
  const spPaymentTermIdByName = new Map<string, number>();
  for (const p of spPaymentTermDefs) {
    const term = await prisma.spPaymentTerm.upsert({
      where: { institute_id_term_name: { institute_id: instId, term_name: p.term_name } },
      update: {},
      create: { institute_id: instId, term_name: p.term_name, days: p.days },
    });
    spPaymentTermIdByName.set(p.term_name, term.payment_term_id);
  }

  const spWarehouse = await prisma.spWarehouse.upsert({
    where: { institute_id_name: { institute_id: instId, name: 'Main Store' } },
    update: {},
    create: { institute_id: instId, name: 'Main Store', address: 'Main Campus Store Room', is_default: true },
  });

  const spVendorDefs = [
    { code: 'VN/SEED/00001', name: 'ABC Suppliers', gstin: '27ABCDE1111F1Z5', city: 'Pune', state: 'Maharashtra' },
    { code: 'VN/SEED/00002', name: 'XYZ Traders', gstin: '27ABCDE2222F1Z5', city: 'Mumbai', state: 'Maharashtra' },
  ];
  for (const v of spVendorDefs) {
    await prisma.spVendor.upsert({
      where: { institute_id_vendor_code: { institute_id: instId, vendor_code: v.code } },
      update: {},
      create: {
        institute_id: instId, vendor_code: v.code, vendor_name: v.name, gstin: v.gstin, city: v.city, state: v.state,
        payment_term_id: spPaymentTermIdByName.get('Net 30'), credit_limit: 200000,
      },
    });
  }

  const spCustomerDefs = [
    { code: 'CN/SEED/00001', name: 'Customer A', city: 'Pune', state: 'Maharashtra' },
    { code: 'CN/SEED/00002', name: 'Customer B', city: 'Nashik', state: 'Maharashtra' },
  ];
  for (const c of spCustomerDefs) {
    await prisma.spCustomer.upsert({
      where: { institute_id_customer_code: { institute_id: instId, customer_code: c.code } },
      update: {},
      create: {
        institute_id: instId, customer_code: c.code, customer_name: c.name, city: c.city, state: c.state,
        payment_term_id: spPaymentTermIdByName.get('Net 15'), credit_limit: 100000,
      },
    });
  }

  const spItemDefs = [
    { code: 'IT/SEED/00001', name: 'Laptop', category: 'Electronics', uom: 'Piece', hsn: '8471', purchase_price: 45000, sales_price: 52000, tax: 'GST 18%' },
    { code: 'IT/SEED/00002', name: 'Printer', category: 'Electronics', uom: 'Piece', hsn: '8443', purchase_price: 12000, sales_price: 14500, tax: 'GST 18%' },
    { code: 'IT/SEED/00003', name: 'Office Chair', category: 'Furniture', uom: 'Piece', hsn: '9401', purchase_price: 3500, sales_price: 4500, tax: 'GST 12%' },
    { code: 'IT/SEED/00004', name: 'Paper (Ream)', category: 'Stationery', uom: 'Box', hsn: '4802', purchase_price: 220, sales_price: 280, tax: 'GST 5%' },
  ];
  for (const i of spItemDefs) {
    await prisma.spItem.upsert({
      where: { institute_id_item_code: { institute_id: instId, item_code: i.code } },
      update: {},
      create: {
        institute_id: instId, item_code: i.code, item_name: i.name,
        category_id: spCategoryIdByName.get(i.category)!, uom_id: spUomIdByName.get(i.uom)!,
        hsn_sac_code: i.hsn, purchase_price: i.purchase_price, sales_price: i.sales_price, tax_code_id: spTaxCodeIdByName.get(i.tax),
      },
    });
  }

  // Sales & Purchase dynamic RBAC (same architecture as Accounts/Canteen/Front Office/Inventory/Transport)
  const spFullPermissions = [
    { resource: 'masters', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'vendors', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'customers', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'items', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'purchase_orders', actions: ['read', 'create', 'update', 'delete', 'submit', 'approve', 'reject', 'cancel'] },
    { resource: 'approval_rules', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'grns', actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'] },
    { resource: 'purchase_invoices', actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'] },
    { resource: 'purchase_payments', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'sales_orders', actions: ['read', 'create', 'update', 'delete', 'confirm', 'cancel'] },
    { resource: 'sales_invoices', actions: ['read', 'create', 'update', 'delete', 'post', 'cancel'] },
    { resource: 'sales_receipts', actions: ['read', 'create', 'update', 'delete'] },
    { resource: 'reports', actions: ['read'] },
    { resource: 'dashboard', actions: ['read'] },
  ];
  const spAdminRole = await prisma.salesPurchaseDynamicRole.upsert({
    where: { institute_id_name: { institute_id: instId, name: 'Purchase & Sales Admin' } },
    update: { permissions: spFullPermissions },
    create: {
      institute_id: instId,
      name: 'Purchase & Sales Admin',
      description: 'Full access to vendors, customers, items, purchase and sales workflows, and registers',
      permissions: spFullPermissions,
    },
  });

  const spDemoPasswordHash = await bcrypt.hash('SalesPurchase#2026', 10);
  await prisma.salesPurchaseUserDynamicRole.upsert({
    where: { institute_id_eddva_user_id: { institute_id: instId, eddva_user_id: 'usr_sp_admin_demo' } },
    update: { role_id: spAdminRole.role_id, password_hash: spDemoPasswordHash },
    create: {
      institute_id: instId,
      eddva_user_id: 'usr_sp_admin_demo',
      user_name: 'Demo Purchase & Sales Admin',
      user_email: 'sp.admin.demo@eddva.com',
      username: 'sp_admin_demo',
      password_hash: spDemoPasswordHash,
      role_id: spAdminRole.role_id,
    },
  });

  console.log('✅ Sales & Purchase Module (Masters, Demo Vendors/Customers/Items, Dynamic RBAC) seeded successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

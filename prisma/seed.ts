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

  // Accounts dynamic RBAC (same architecture as Library/Sports/Canteen/Front Office/Inventory/Transport)
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

  await prisma.canteenRole.upsert({
    where: { name: 'CANTEEN_MANAGER' },
    update: { description: 'Manages menu, items, members, orders, shifts, payments, reports, and wallets', isSystem: true },
    create: { name: 'CANTEEN_MANAGER', description: 'Manages menu, items, members, orders, shifts, payments, reports, and wallets', isSystem: true },
  });

  await prisma.canteenRole.upsert({
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

  console.log('✅ Canteen Permissions, Roles & Demo Data seeded successfully!');

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

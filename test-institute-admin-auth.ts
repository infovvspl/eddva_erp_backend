import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from './src/prisma/prisma.service';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

async function runTests() {
  console.log('====================================================');
  console.log('INSTITUTE ADMIN AUTHENTICATION & MULTI-TENANT TESTS');
  console.log('====================================================\n');

  const app: INestApplication = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const server = app.getHttpServer();

  const jwtService = app.get(JwtService);
  const prisma = app.get(PrismaService);
  const jwtSecret = process.env.JWT_SECRET || 'eddva_erp_super_secret_jwt_key_2026';

  // 1. Generate Institute Admin A Token
  const payloadAdminA = {
    id: 'INST_ADMIN_USER_A',
    role: 'INSTITUTE_ADMIN',
    email: 'naval.adminA@gmail.com',
    tenantType: 'school',
    instituteId: 'INST_ALPHA_101',
    sessionId: 'SESS_ALPHA_999',
  };
  const tokenAdminA = jwtService.sign(payloadAdminA, { secret: jwtSecret });

  // 2. Generate Institute Admin B Token
  const payloadAdminB = {
    id: 'INST_ADMIN_USER_B',
    role: 'INSTITUTE_ADMIN',
    email: 'naval.adminB@gmail.com',
    tenantType: 'school',
    instituteId: 'INST_BETA_202',
    sessionId: 'SESS_BETA_888',
  };
  const tokenAdminB = jwtService.sign(payloadAdminB, { secret: jwtSecret });

  // 3. Generate Legacy ERP User Token (sub)
  const legacyUser = await prisma.user.findFirst({ where: { status: 'ACTIVE' } });
  const payloadLegacy = { sub: legacyUser?.id || 'admin-id', email: legacyUser?.email || 'admin@eddva.com' };
  const tokenLegacy = jwtService.sign(payloadLegacy, { secret: jwtSecret });

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName} - ${detail || ''}`);
      failed++;
    }
  }

  try {
    // --- TEST 1: GET /api/auth/me with Institute Admin A token ---
    console.log('--- TEST 1: Auth Profile (/api/auth/me) ---');
    const resMe = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAdminA}`);

    assert(resMe.status === 200, 'GET /api/auth/me returns 200 OK');
    assert(resMe.body.userId === payloadAdminA.id, 'user.userId matches payload.id');
    assert(resMe.body.role === 'INSTITUTE_ADMIN', 'user.role is INSTITUTE_ADMIN');
    assert(resMe.body.instituteId === payloadAdminA.instituteId, 'user.instituteId matches INST_ALPHA_101');
    assert(resMe.body.tenantType === 'school', 'user.tenantType is school');
    assert(resMe.body.sessionId === payloadAdminA.sessionId, 'user.sessionId is SESS_ALPHA_999');

    // --- TEST 2: Create Customer, Vendor, Item as Institute Admin A ---
    console.log('\n--- TEST 2: Data Creation by Institute Admin A ---');
    const payTerm = await prisma.paymentTerm.findFirst();
    const uom = await prisma.uom.findFirst();
    const category = await prisma.itemCategory.findFirst();
    const taxCode = await prisma.taxCode.findFirst();
    const warehouse = await prisma.warehouse.findFirst();

    // Customer
    const resCust = await request(server)
      .post('/api/customers')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({
        customerName: 'Alpha School Client',
        addressLine1: '123 Alpha St',
        city: 'Alpha City',
        state: 'Alpha State',
        pincode: '123456',
        paymentTermId: payTerm!.id,
      });
    assert(resCust.status === 201, 'Create Customer as Institute Admin A returns 201 Created');
    const customerA = resCust.body;
    assert(customerA.instituteId === payloadAdminA.instituteId, 'Customer A scoped to INST_ALPHA_101');

    // Vendor
    const resVend = await request(server)
      .post('/api/vendors')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({
        vendorName: 'Alpha Supplier Ltd',
        addressLine1: '456 Vendor Road',
        city: 'Vendor City',
        state: 'Vendor State',
        pincode: '654321',
        paymentTermId: payTerm!.id,
      });
    assert(resVend.status === 201, 'Create Vendor as Institute Admin A returns 201 Created');
    const vendorA = resVend.body;
    assert(vendorA.instituteId === payloadAdminA.instituteId, 'Vendor A scoped to INST_ALPHA_101');

    // Item
    const itemCodeA = `ITEM-ALPHA-${Date.now()}`;
    const resItem = await request(server)
      .post('/api/items')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({
        itemCode: itemCodeA,
        itemName: 'Alpha Textbooks',
        categoryId: category!.id,
        uomId: uom!.id,
        hsnSacCode: '4901',
        purchasePrice: 100,
        salesPrice: 150,
        taxCodeId: taxCode!.id,
      });
    assert(resItem.status === 201, 'Create Item as Institute Admin A returns 201 Created');
    const itemA = resItem.body;
    assert(itemA.instituteId === payloadAdminA.instituteId, 'Item A scoped to INST_ALPHA_101');

    // --- TEST 3: Sales Order & Purchase Order Creation ---
    console.log('\n--- TEST 3: Sales & Purchase Order Creation ---');
    const resSo = await request(server)
      .post('/api/sales-orders')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({
        customerId: customerA.id,
        soDate: new Date().toISOString(),
        deliveryDate: new Date().toISOString(),
        items: [{ itemId: itemA.id, quantity: 10, unitPrice: 150, taxCodeId: taxCode!.id }],
      });
    assert(resSo.status === 201, 'Create Sales Order as Institute Admin A returns 201 Created');
    const soA = resSo.body;
    assert(soA.instituteId === payloadAdminA.instituteId, 'Sales Order A scoped to INST_ALPHA_101');

    const resPo = await request(server)
      .post('/api/purchase-orders')
      .set('Authorization', `Bearer ${tokenAdminA}`)
      .send({
        vendorId: vendorA.id,
        warehouseId: warehouse!.id,
        poDate: new Date().toISOString(),
        expectedDeliveryDate: new Date().toISOString(),
        items: [{ itemId: itemA.id, quantity: 50, unitPrice: 100, taxCodeId: taxCode!.id }],
      });
    assert(resPo.status === 201, 'Create Purchase Order as Institute Admin A returns 201 Created');
    const poA = resPo.body;
    assert(poA.instituteId === payloadAdminA.instituteId, 'Purchase Order A scoped to INST_ALPHA_101');

    // --- TEST 4: Querying Sales & Purchase Data as Admin A vs Admin B ---
    console.log('\n--- TEST 4: Multi-Tenant Data Isolation Checks ---');
    
    // Admin A gets lists
    const resListSoA = await request(server)
      .get('/api/sales-orders')
      .set('Authorization', `Bearer ${tokenAdminA}`);
    assert(resListSoA.status === 200, 'Admin A lists Sales Orders (200 OK)');
    const foundSoInA = resListSoA.body.data.some((s: any) => s.id === soA.id);
    assert(foundSoInA, 'Sales Order A found in Admin A list');

    const resListPoA = await request(server)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${tokenAdminA}`);
    assert(resListPoA.status === 200, 'Admin A lists Purchase Orders (200 OK)');
    const foundPoInA = resListPoA.body.data.some((p: any) => p.id === poA.id);
    assert(foundPoInA, 'Purchase Order A found in Admin A list');

    // Admin B gets lists (Must NOT see Admin A's records)
    const resListSoB = await request(server)
      .get('/api/sales-orders')
      .set('Authorization', `Bearer ${tokenAdminB}`);
    assert(resListSoB.status === 200, 'Admin B lists Sales Orders (200 OK)');
    const foundSoInB = resListSoB.body.data.some((s: any) => s.id === soA.id);
    assert(!foundSoInB, 'Sales Order A NOT visible in Admin B list');

    const resListPoB = await request(server)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${tokenAdminB}`);
    assert(resListPoB.status === 200, 'Admin B lists Purchase Orders (200 OK)');
    const foundPoInB = resListPoB.body.data.some((p: any) => p.id === poA.id);
    assert(!foundPoInB, 'Purchase Order A NOT visible in Admin B list');

    // Admin B attempts to fetch Admin A's Sales Order by ID directly
    const resDirectSoB = await request(server)
      .get(`/api/sales-orders/${soA.id}`)
      .set('Authorization', `Bearer ${tokenAdminB}`);
    assert(resDirectSoB.status === 404, 'Admin B fetching Admin A Sales Order by ID returns 404 Not Found');

    // Admin B attempts to fetch Admin A's Purchase Order by ID directly
    const resDirectPoB = await request(server)
      .get(`/api/purchase-orders/${poA.id}`)
      .set('Authorization', `Bearer ${tokenAdminB}`);
    assert(resDirectPoB.status === 404, 'Admin B fetching Admin A Purchase Order by ID returns 404 Not Found');

    // --- TEST 5: Backward Compatibility for Legacy Token (sub) ---
    console.log('\n--- TEST 5: Legacy Authentication (sub) Compatibility ---');
    const resLegacyMe = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenLegacy}`);
    assert(resLegacyMe.status === 200, 'Legacy token GET /api/auth/me returns 200 OK');
    assert(resLegacyMe.body.userId === legacyUser?.id, 'Legacy token correctly resolves user.userId');

  } catch (err) {
    console.error('Unexpected error during testing:', err);
    failed++;
  } finally {
    await app.close();
    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

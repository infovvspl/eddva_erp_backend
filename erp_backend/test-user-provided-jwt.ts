import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';

async function runTests() {
  console.log('====================================================');
  console.log('TESTING USER-PROVIDED OFFICIAL INSTITUTE ADMIN TOKEN');
  console.log('====================================================\n');

  const app: INestApplication = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  const server = app.getHttpServer();

  const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVhM2EwMmY5LTk0ZmItNGRiOC1iMjE5LWY4YWMzOTAwNmQyZCIsInJvbGUiOiJJTlNUSVRVVEVfQURNSU4iLCJlbWFpbCI6Im5hdmFsQGdtYWlsLmNvbSIsInRlbmFudFR5cGUiOiJzY2hvb2wiLCJpbnN0aXR1dGVJZCI6ImMyNTljZDRlLWIwMTgtNDVlMi04ZTQ2LTUyYTQ5N2NhNDlhMSIsInNlc3Npb25JZCI6ImFkN2MwMzU5LWVhMTctNDQxNi1hZjU3LWFhYTEzNzllYTEzNCIsImlhdCI6MTc4NjUzNDQ2NywiZXhwIjoxNzg3MTM5MjY3fQ.HDmMSTZIXsfqAnH4tjmHjkGoJ1a5WjKATQPuIvS4Wzw';

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
    // 1. GET /api/auth/me
    console.log('--- Step 1: GET /api/auth/me ---');
    const resMe = await request(server)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);

    assert(resMe.status === 200, 'GET /api/auth/me returns 200 OK', JSON.stringify(resMe.body));
    assert(resMe.body.userId === '5a3a02f9-94fb-4db8-b219-f8ac39006d2d', 'userId matches 5a3a02f9...');
    assert(resMe.body.role === 'INSTITUTE_ADMIN', 'role is INSTITUTE_ADMIN');
    assert(resMe.body.email === 'naval@gmail.com', 'email is naval@gmail.com');
    assert(resMe.body.instituteId === 'c259cd4e-b018-45e2-8e46-52a497ca49a1', 'instituteId matches c259cd4e...');
    assert(resMe.body.tenantType === 'school', 'tenantType is school');
    assert(resMe.body.sessionId === 'ad7c0359-ea17-4416-af57-aaa1379ea134', 'sessionId matches ad7c0359...');

    // 2. GET /api/item-categories
    console.log('\n--- Step 2: GET /api/item-categories ---');
    const resCat = await request(server)
      .get('/api/item-categories')
      .set('Authorization', `Bearer ${userToken}`);

    assert(resCat.status === 200, 'GET /api/item-categories returns 200 OK', JSON.stringify(resCat.body));

    // 3. GET /api/sales-orders
    console.log('\n--- Step 3: GET /api/sales-orders ---');
    const resSo = await request(server)
      .get('/api/sales-orders')
      .set('Authorization', `Bearer ${userToken}`);

    assert(resSo.status === 200, 'GET /api/sales-orders returns 200 OK', JSON.stringify(resSo.body));

    // 4. GET /api/purchase-orders
    console.log('\n--- Step 4: GET /api/purchase-orders ---');
    const resPo = await request(server)
      .get('/api/purchase-orders')
      .set('Authorization', `Bearer ${userToken}`);

    assert(resPo.status === 200, 'GET /api/purchase-orders returns 200 OK', JSON.stringify(resPo.body));

  } catch (err) {
    console.error('Error during test execution:', err);
    failed++;
  } finally {
    await app.close();
    console.log('\n====================================================');
    console.log(`VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();

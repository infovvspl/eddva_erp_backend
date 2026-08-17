import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import request from 'supertest';

async function main() {
  const app = await NestFactory.create(AppModule);
  await app.init();
  const userToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjVhM2EwMmY5LTk0ZmItNGRiOC1iMjE5LWY4YWMzOTAwNmQyZCIsInJvbGUiOiJJTlNUSVRVVEVfQURNSU4iLCJlbWFpbCI6Im5hdmFsQGdtYWlsLmNvbSIsInRlbmFudFR5cGUiOiJzY2hvb2wiLCJpbnN0aXR1dGVJZCI6ImMyNTljZDRlLWIwMTgtNDVlMi04ZTQ2LTUyYTQ5N2NhNDlhMSIsInNlc3Npb25JZCI6ImFkN2MwMzU5LWVhMTctNDQxNi1hZjU3LWFhYTEzNzllYTEzNCIsImlhdCI6MTc4NjUzNDQ2NywiZXhwIjoxNzg3MTM5MjY3fQ.HDmMSTZIXsfqAnH4tjmHjkGoJ1a5WjKATQPuIvS4Wzw';

  const res = await request(app.getHttpServer())
    .get('/api/auth/me')
    .set('Authorization', `Bearer ${userToken}`);

  console.log('Status Code:', res.status);
  console.log('Body:', res.body);
  await app.close();
}

main();

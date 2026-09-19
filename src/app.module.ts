import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NumberingModule } from './numbering/numbering.module';
import { AuthModule } from './auth/auth.module';
import { PdfModule } from './pdf/pdf.module';
import { CanteenModule } from './canteen/canteen.module';
import { LibraryModule } from './library/library.module';
import { SportsModule } from './sports/sports.module';
import { FrontOfficeModule } from './front-office/front-office.module';
import { InventoryModule } from './inventory/inventory.module';
import { TransportModule } from './transport/transport.module';
import { AccountsModule } from './accounts/accounts.module';
import { SalesPurchaseModule } from './sales-purchase/sales-purchase.module';
import { AdmissionModule } from './admission/admission.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuditModule,
    NumberingModule,
    AuthModule,
    PdfModule,
    CanteenModule,
    LibraryModule,
    SportsModule,
    FrontOfficeModule,
    InventoryModule,
    TransportModule,
    AccountsModule,
    SalesPurchaseModule,
    AdmissionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

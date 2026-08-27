import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { NumberingModule } from './numbering/numbering.module';
import { AuthModule } from './auth/auth.module';
import { MastersModule } from './masters/masters.module';
import { PartiesModule } from './parties/parties.module';
import { PurchaseModule } from './purchase/purchase.module';
import { SalesModule } from './sales/sales.module';
import { ReportsModule } from './reports/reports.module';
import { PdfModule } from './pdf/pdf.module';
import { CanteenModule } from './canteen/canteen.module';
import { LibraryModule } from './library/library.module';
import { SportsModule } from './sports/sports.module';
import { FrontOfficeModule } from './front-office/front-office.module';
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
    MastersModule,
    PartiesModule,
    PurchaseModule,
    SalesModule,
    ReportsModule,
    PdfModule,
    CanteenModule,
    LibraryModule,
    SportsModule,
    FrontOfficeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

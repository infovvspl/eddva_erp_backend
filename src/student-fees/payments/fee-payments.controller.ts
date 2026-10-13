import { Controller, Get, Post, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FeePaymentsService } from './fee-payments.service';
import { RecordFeePaymentDto, QueryFeePaymentDto } from './dto/payment.dto';
import { StudentFeesJwtGuard } from '../auth/student-fees-jwt.guard';
import { FeeUser } from '../auth/student-fees-user.decorator';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@ApiTags('Student Fees / Payments')
@ApiBearerAuth()
@UseGuards(StudentFeesJwtGuard)
@Controller('api/student-fees/payments')
export class FeePaymentsController {
  constructor(private readonly svc: FeePaymentsService) {}

  @Post()
  @ApiOperation({ summary: 'Record a fee payment for a student against a fee structure' })
  record(@FeeUser() actor: FeePlatformUser, @Body() dto: RecordFeePaymentDto) {
    return this.svc.record(actor, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List payments, filterable by student/class/academic year' })
  findAll(@FeeUser() actor: FeePlatformUser, @Query() query: QueryFeePaymentDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get('students/:studentId/balance')
  @ApiOperation({ summary: "A student's fee position across every term for their class" })
  @ApiParam({ name: 'studentId', example: 1 })
  balanceForStudent(@FeeUser() actor: FeePlatformUser, @Param('studentId', ParseIntPipe) studentId: number) {
    return this.svc.balanceForStudent(actor.institute_id, studentId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a payment (receipt) by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }
}

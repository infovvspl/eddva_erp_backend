import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FeeStructuresService } from './fee-structures.service';
import { CreateFeeStructureDto, UpdateFeeStructureDto, QueryFeeStructureDto } from './dto/fee-structure.dto';
import { StudentFeesJwtGuard } from '../auth/student-fees-jwt.guard';
import { FeeUser } from '../auth/student-fees-user.decorator';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@ApiTags('Student Fees / Fee Structures')
@ApiBearerAuth()
@UseGuards(StudentFeesJwtGuard)
@Controller('api/student-fees/fee-structures')
export class FeeStructuresController {
  constructor(private readonly svc: FeeStructuresService) {}

  @Post()
  @ApiOperation({ summary: 'Create a fee term for a class (e.g. "Term 1" for Grade 5, 2026-27)' })
  create(@FeeUser() actor: FeePlatformUser, @Body() dto: CreateFeeStructureDto) {
    return this.svc.create(actor.institute_id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List fee structures, filterable by class/academic year' })
  findAll(@FeeUser() actor: FeePlatformUser, @Query() query: QueryFeeStructureDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a fee structure by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a fee structure amount/due date' })
  @ApiParam({ name: 'id', example: 1 })
  update(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeeStructureDto) {
    return this.svc.update(actor.institute_id, id, dto);
  }
}

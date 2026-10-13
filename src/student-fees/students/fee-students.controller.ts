import { Controller, Get, Post, Patch, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FeeStudentsService } from './fee-students.service';
import { CreateFeeStudentDto, UpdateFeeStudentDto, QueryFeeStudentDto } from './dto/student.dto';
import { StudentFeesJwtGuard } from '../auth/student-fees-jwt.guard';
import { FeeUser } from '../auth/student-fees-user.decorator';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@ApiTags('Student Fees / Students')
@ApiBearerAuth()
@UseGuards(StudentFeesJwtGuard)
@Controller('api/student-fees/students')
export class FeeStudentsController {
  constructor(private readonly svc: FeeStudentsService) {}

  @Post()
  @ApiOperation({ summary: 'Add a student to a class' })
  create(@FeeUser() actor: FeePlatformUser, @Body() dto: CreateFeeStudentDto) {
    return this.svc.create(actor.institute_id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List students, filterable by class/search' })
  findAll(@FeeUser() actor: FeePlatformUser, @Query() query: QueryFeeStudentDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a student by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a student (including moving between classes)' })
  @ApiParam({ name: 'id', example: 1 })
  update(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeeStudentDto) {
    return this.svc.update(actor.institute_id, id, dto);
  }
}

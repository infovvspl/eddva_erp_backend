import { Controller, Get, Post, Patch, Delete, Body, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { FeeClassesService } from './fee-classes.service';
import { CreateFeeClassDto, UpdateFeeClassDto, QueryFeeClassDto } from './dto/class.dto';
import { StudentFeesJwtGuard } from '../auth/student-fees-jwt.guard';
import { FeeUser } from '../auth/student-fees-user.decorator';
import type { FeePlatformUser } from '../auth/student-fees-auth.service';

@ApiTags('Student Fees / Classes')
@ApiBearerAuth()
@UseGuards(StudentFeesJwtGuard)
@Controller('api/student-fees/classes')
export class FeeClassesController {
  constructor(private readonly svc: FeeClassesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a class/grade for an academic year' })
  create(@FeeUser() actor: FeePlatformUser, @Body() dto: CreateFeeClassDto) {
    return this.svc.create(actor.institute_id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List classes, optionally filtered by academic year' })
  findAll(@FeeUser() actor: FeePlatformUser, @Query() query: QueryFeeClassDto) {
    return this.svc.findAll(actor.institute_id, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a class by id' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(actor.institute_id, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a class' })
  @ApiParam({ name: 'id', example: 1 })
  update(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateFeeClassDto) {
    return this.svc.update(actor.institute_id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a class (only if it has no students or fee structures)' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@FeeUser() actor: FeePlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.remove(actor.institute_id, id);
  }
}

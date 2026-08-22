import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { SportsHousesService } from './sports-houses.service';
import { CreateHouseDto, UpdateHouseDto } from './dto/create-house.dto';
import { AddHouseMemberDto } from './dto/add-house-member.dto';
import { AwardHousePointsDto } from './dto/award-house-points.dto';
import { SportsJwtGuard } from '../auth/sports-jwt.guard';
import { SportsInstituteAdminViewOnlyGuard } from '../auth/sports-institute-admin-view-only.guard';
import { SportsPermissionsGuard } from '../auth/sports-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Sports / House Management')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('sports/houses')
export class SportsHousesController {
  constructor(private readonly svc: SportsHousesService) {}

  @Post()
  @RequirePermission({ resource: 'houses', action: 'create' })
  @ApiOperation({ summary: 'Create a new House (e.g. Red House, Falcon House)' })
  createHouse(@Body() dto: CreateHouseDto) {
    return this.svc.createHouse(dto);
  }

  @Get()
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'List all Houses' })
  listHouses() {
    return this.svc.listHouses();
  }

  @Get('standings')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'Get House Standings & Total Points (source of truth leaderboard)' })
  getStandings(@Query('academic_year') academicYear?: string) {
    return this.svc.getStandings(academicYear ?? '2026-27');
  }

  @Get(':id')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'Get House details' })
  @ApiParam({ name: 'id', description: 'house_id of the House (e.g. 1)' })
  getHouse(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getHouse(id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'houses', action: 'update' })
  @ApiOperation({ summary: 'Update House details' })
  @ApiParam({ name: 'id', description: 'house_id of the House to update' })
  updateHouse(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHouseDto) {
    return this.svc.updateHouse(id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'houses', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a House' })
  @ApiParam({ name: 'id', description: 'house_id of the House to delete' })
  deleteHouse(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteHouse(id);
  }

  @Post(':id/members')
  @RequirePermission({ resource: 'houses', action: 'update' })
  @ApiOperation({ summary: 'Assign student participant to a house for academic year' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  addMember(@Param('id', ParseIntPipe) houseId: number, @Body() dto: AddHouseMemberDto) {
    return this.svc.addMember(houseId, dto);
  }

  @Get(':id/members')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'List members of a house' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  getMembers(@Param('id', ParseIntPipe) houseId: number, @Query('academic_year') academicYear?: string) {
    return this.svc.getMembers(houseId, academicYear);
  }

  @Post(':id/points')
  @RequirePermission({ resource: 'houses', action: 'award_points' })
  @ApiOperation({ summary: 'Award or deduct points (Points Ledger entry — source of truth for standings)' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  awardPoints(@Param('id', ParseIntPipe) houseId: number, @Body() dto: AwardHousePointsDto) {
    return this.svc.awardPoints(houseId, dto);
  }

  @Get(':id/points')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'View detailed house points history ledger' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  getPointsHistory(@Param('id', ParseIntPipe) houseId: number) {
    return this.svc.getPointsHistory(houseId);
  }
}

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
import { SportsUser } from '../auth/sports-user.decorator';
import type { SportsPlatformUser } from '../auth/sports-auth.service';

@ApiTags('Sports / House Management')
@ApiBearerAuth()
@UseGuards(SportsJwtGuard, SportsInstituteAdminViewOnlyGuard, SportsPermissionsGuard)
@Controller('api/sports/houses')
export class SportsHousesController {
  constructor(private readonly svc: SportsHousesService) {}

  @Post()
  @RequirePermission({ resource: 'houses', action: 'create' })
  @ApiOperation({ summary: 'Create a new House (e.g. Red House, Falcon House)' })
  createHouse(@SportsUser() user: SportsPlatformUser, @Body() dto: CreateHouseDto) {
    return this.svc.createHouse(user.institute_id, dto);
  }

  @Get()
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'List all Houses' })
  listHouses(@SportsUser() user: SportsPlatformUser) {
    return this.svc.listHouses(user.institute_id);
  }

  @Get('standings')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'Get House Standings & Total Points (source of truth leaderboard)' })
  getStandings(@SportsUser() user: SportsPlatformUser, @Query('academic_year') academicYear?: string) {
    return this.svc.getStandings(user.institute_id, academicYear ?? '2026-27');
  }

  @Get(':id')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'Get House details' })
  @ApiParam({ name: 'id', description: 'house_id of the House (e.g. 1)' })
  getHouse(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.getHouse(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'houses', action: 'update' })
  @ApiOperation({ summary: 'Update House details' })
  @ApiParam({ name: 'id', description: 'house_id of the House to update' })
  updateHouse(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHouseDto) {
    return this.svc.updateHouse(user.institute_id, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'houses', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a House' })
  @ApiParam({ name: 'id', description: 'house_id of the House to delete' })
  deleteHouse(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteHouse(user.institute_id, id);
  }

  @Post(':id/members')
  @RequirePermission({ resource: 'houses', action: 'update' })
  @ApiOperation({ summary: 'Assign student participant to a house for academic year' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  addMember(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) houseId: number, @Body() dto: AddHouseMemberDto) {
    return this.svc.addMember(user.institute_id, houseId, dto);
  }

  @Get(':id/members')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'List members of a house' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  getMembers(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) houseId: number, @Query('academic_year') academicYear?: string) {
    return this.svc.getMembers(user.institute_id, houseId, academicYear);
  }

  @Post(':id/points')
  @RequirePermission({ resource: 'houses', action: 'award_points' })
  @ApiOperation({ summary: 'Award or deduct points (Points Ledger entry — source of truth for standings)' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  awardPoints(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) houseId: number, @Body() dto: AwardHousePointsDto) {
    return this.svc.awardPoints(user.institute_id, houseId, dto);
  }

  @Get(':id/points')
  @RequirePermission({ resource: 'houses', action: 'read' })
  @ApiOperation({ summary: 'View detailed house points history ledger' })
  @ApiParam({ name: 'id', description: 'house_id of target House (e.g. 1)' })
  getPointsHistory(@SportsUser() user: SportsPlatformUser, @Param('id', ParseIntPipe) houseId: number) {
    return this.svc.getPointsHistory(user.institute_id, houseId);
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { OffersService } from './offers.service';
import { DeclineOfferDto, IssueOfferDto, QueryOfferDto } from './dto/offer.dto';

@ApiTags('Admission / Offers')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/applications/:applicationId/offer')
export class ApplicationOffersController {
  constructor(private readonly svc: OffersService) {}

  @Post()
  @RequirePermission({ resource: 'offers', action: 'create' })
  @ApiOperation({
    summary:
      'Issue an offer to a shortlisted/waitlisted application. Seat-safe: capacity is checked under a row lock',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  issue(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: IssueOfferDto,
  ) {
    return this.svc.issue(user, applicationId, dto);
  }

  @Get()
  @RequirePermission({ resource: 'offers', action: 'read' })
  @ApiOperation({
    summary:
      "Get the application's offer, with a backend-computed seconds_until_expiry countdown",
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  get(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.getForApplication(user.institute_id, applicationId);
  }

  @Post('accept')
  @RequirePermission({ resource: 'offers', action: 'accept' })
  @ApiOperation({
    summary:
      'Record acceptance. Refused with OFFER_EXPIRED once offer_expiry_date has passed',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  accept(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.accept(user, applicationId);
  }

  @Post('decline')
  @RequirePermission({ resource: 'offers', action: 'decline' })
  @ApiOperation({
    summary: 'Record a decline: cancels the application and releases the seat',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  decline(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Body() dto: DeclineOfferDto,
  ) {
    return this.svc.decline(user, applicationId, dto);
  }
}

@ApiTags('Admission / Offers')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/offers')
export class OffersController {
  constructor(private readonly svc: OffersService) {}

  @Get()
  @RequirePermission({ resource: 'offers', action: 'read' })
  @ApiOperation({
    summary:
      'List offers (filter by status, program, session, expiring soon, date range) with countdowns',
  })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Query() query: QueryOfferDto,
  ) {
    return this.svc.findAll(user.institute_id, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'offers', action: 'read' })
  @ApiOperation({ summary: 'Get an offer' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user.institute_id, id);
  }
}

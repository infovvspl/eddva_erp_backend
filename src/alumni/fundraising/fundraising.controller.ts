import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PdfService } from '../../pdf/pdf.service';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { CampaignsService } from './campaigns.service';
import { DonationsService } from './donations.service';
import { renderReceiptHtml } from './receipt.renderer';
import {
  ConfirmDonationDto,
  CreateCampaignDto,
  CreateDonationDto,
  DonationReasonDto,
  QueryCampaignDto,
  QueryDonationDto,
  ReceiptQueryDto,
  ReverseDonationDto,
  UpdateCampaignDto,
} from './dto/fundraising.dto';

const GUARDS = [
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
] as const;

@ApiTags('Alumni / Fundraising Campaigns')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/campaigns')
export class CampaignsController {
  constructor(
    private readonly svc: CampaignsService,
    private readonly donations: DonationsService,
  ) {}

  @Post()
  @StaffOnly()
  @RequirePermission({ resource: 'campaigns', action: 'create' })
  @ApiOperation({ summary: 'Create a fundraising campaign' })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: CreateCampaignDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'campaigns', action: 'read' })
  @ApiOperation({ summary: 'List campaigns with progress' })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryCampaignDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'campaigns', action: 'read' })
  @ApiOperation({ summary: 'Get a campaign' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'campaigns', action: 'update' })
  @ApiOperation({
    summary: 'Update a campaign (title, description, goal, end date)',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCampaignDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/close')
  @StaffOnly()
  @RequirePermission({ resource: 'campaigns', action: 'close' })
  @ApiOperation({ summary: 'Close a campaign (no more donations)' })
  @ApiParam({ name: 'id', example: 1 })
  close(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.close(user, id);
  }

  @Get(':id/statistics')
  @StaffOnly()
  @RequirePermission({ resource: 'campaigns', action: 'read' })
  @ApiOperation({
    summary:
      'Campaign statistics computed from the donation ledger (totals, donors, by payment mode, by month, cache drift)',
  })
  @ApiParam({ name: 'id', example: 1 })
  statistics(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.statistics(user, id);
  }

  @Get(':id/donations')
  @RequirePermission({ resource: 'donations', action: 'read' })
  @ApiOperation({
    summary:
      'Donations of a campaign. Staff see donors; alumni see only received donations and never who gave anonymously',
  })
  @ApiParam({ name: 'id', example: 1 })
  campaignDonations(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryDonationDto,
  ) {
    return this.donations.campaignDonations(user, id, query);
  }
}

@ApiTags('Alumni / Donations & Receipts')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/donations')
export class DonationsController {
  constructor(
    private readonly svc: DonationsService,
    private readonly pdf: PdfService,
  ) {}

  @Post()
  @RequirePermission({ resource: 'donations', action: 'create' })
  @ApiOperation({
    summary:
      'Donate. Alumni create a PENDING pledge; staff can record a donation as received (mark_received) which issues the receipt and updates the campaign total',
  })
  create(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: CreateDonationDto,
  ) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'donations', action: 'read' })
  @ApiOperation({
    summary:
      'List donations — filter by campaign, donor, status, payment mode, date range (alumni: their own)',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryDonationDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'donations', action: 'read' })
  @ApiOperation({ summary: 'Get a donation' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Post(':id/confirm')
  @StaffOnly()
  @RequirePermission({ resource: 'donations', action: 'confirm' })
  @ApiOperation({
    summary:
      'Confirm the money was received: issues the receipt number and re-derives the campaign total, atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  confirm(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmDonationDto,
  ) {
    return this.svc.confirm(user, id, dto);
  }

  @Post(':id/fail')
  @StaffOnly()
  @RequirePermission({ resource: 'donations', action: 'confirm' })
  @ApiOperation({
    summary: 'Mark a pending donation as failed (money never arrived)',
  })
  @ApiParam({ name: 'id', example: 1 })
  fail(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DonationReasonDto,
  ) {
    return this.svc.fail(user, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermission({ resource: 'donations', action: 'create' })
  @ApiOperation({
    summary: 'Withdraw a pending pledge (donor: their own; or staff)',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DonationReasonDto,
  ) {
    return this.svc.cancel(user, id, dto);
  }

  @Post(':id/reverse')
  @StaffOnly()
  @RequirePermission({ resource: 'donations', action: 'reverse' })
  @ApiOperation({
    summary:
      'Reverse a received donation (audited; receipt is voided, campaign total re-derived). A reason is required',
  })
  @ApiParam({ name: 'id', example: 1 })
  reverse(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReverseDonationDto,
  ) {
    return this.svc.reverse(user, id, dto);
  }

  @Get(':id/receipt')
  @RequirePermission({ resource: 'receipts', action: 'read' })
  @ApiOperation({
    summary:
      'Donation receipt — JSON by default, ?format=pdf for a PDF (donor themselves or staff)',
  })
  @ApiParam({ name: 'id', example: 1 })
  async receipt(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ReceiptQueryDto,
    @Res() res: Response,
  ) {
    const receipt = await this.svc.receipt(user, id);
    if (query.format !== 'pdf') {
      // @Res() bypasses the global response interceptor, so the envelope is written here.
      res.json({ success: true, data: receipt });
      return;
    }
    const buffer = await this.pdf.generateHtmlPdf(renderReceiptHtml(receipt));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="receipt-${receipt.receipt_number.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf"`,
      'Cache-Control': 'private, no-store',
    });
    res.send(buffer);
  }
}

@ApiTags('Alumni / Donations & Receipts')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/profiles/:alumniId/donation-history')
export class DonorHistoryController {
  constructor(private readonly svc: DonationsService) {}

  @Get()
  @RequirePermission({ resource: 'donations', action: 'read' })
  @ApiOperation({
    summary:
      'Donation history of an alumnus with totals — filter by campaign, payment mode, dates (alumni: only their own)',
  })
  @ApiParam({ name: 'alumniId', example: 1 })
  history(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('alumniId', ParseIntPipe) alumniId: number,
    @Query() query: QueryDonationDto,
  ) {
    return this.svc.donorHistory(user, alumniId, query);
  }
}

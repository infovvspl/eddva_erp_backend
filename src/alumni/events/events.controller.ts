import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AlumniJwtGuard } from '../auth/alumni-jwt.guard';
import { AlumniInstituteAdminViewOnlyGuard } from '../auth/alumni-institute-admin-view-only.guard';
import { AlumniPermissionsGuard } from '../auth/alumni-permissions.guard';
import {
  RequirePermission,
  StaffOnly,
} from '../auth/require-permissions.decorator';
import { AlumniUser } from '../auth/alumni-user.decorator';
import type { AlumniPlatformUser } from '../auth/alumni-auth.service';
import { EventsService } from './events.service';
import { RegistrationsService } from './registrations.service';
import { EventPaymentsService } from './event-payments.service';
import {
  CancelEventDto,
  CancelRegistrationDto,
  CreateEventDto,
  MarkEventAttendanceDto,
  QueryEventDto,
  QueryRegistrationDto,
  RecordEventPaymentDto,
  RegisterForEventDto,
  UpdateEventDto,
} from './dto/event.dto';

const GUARDS = [
  AlumniJwtGuard,
  AlumniInstituteAdminViewOnlyGuard,
  AlumniPermissionsGuard,
] as const;

@ApiTags('Alumni / Events')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/events')
export class EventsController {
  constructor(
    private readonly svc: EventsService,
    private readonly registrations: RegistrationsService,
  ) {}

  @Post()
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'create' })
  @ApiOperation({
    summary:
      'Create an event (reunion / webinar / networking / fundraiser; online / offline / hybrid; free or paid)',
  })
  create(@AlumniUser() user: AlumniPlatformUser, @Body() dto: CreateEventDto) {
    return this.svc.create(user, dto);
  }

  @Get()
  @RequirePermission({ resource: 'events', action: 'read' })
  @ApiOperation({
    summary:
      'List events — filter by type, mode, status, date range, paid, registration_open',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryEventDto,
  ) {
    return this.svc.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'events', action: 'read' })
  @ApiOperation({
    summary: 'Get an event with registered count and seats left',
  })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.findOne(user, id);
  }

  @Patch(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'update' })
  @ApiOperation({
    summary:
      'Update an event. Capacity cannot drop below current registrations; pricing is locked once anyone registered',
  })
  @ApiParam({ name: 'id', example: 1 })
  update(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateEventDto,
  ) {
    return this.svc.update(user, id, dto);
  }

  @Post(':id/cancel')
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'cancel' })
  @ApiOperation({
    summary:
      'Cancel an event: all open registrations are cancelled and alumni notified; paid ones are listed for refund',
  })
  @ApiParam({ name: 'id', example: 1 })
  cancel(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelEventDto,
  ) {
    return this.svc.cancel(user, id, dto);
  }

  @Delete(':id')
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'delete' })
  @ApiOperation({
    summary: 'Delete an event nobody registered for (otherwise cancel it)',
  })
  @ApiParam({ name: 'id', example: 1 })
  remove(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.remove(user, id);
  }

  @Get(':id/statistics')
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'read' })
  @ApiOperation({
    summary:
      'Registrations, attendance, no-shows, capacity and ticket revenue of an event',
  })
  @ApiParam({ name: 'id', example: 1 })
  statistics(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.svc.statistics(user, id);
  }

  @Post(':id/banner')
  @StaffOnly()
  @RequirePermission({ resource: 'events', action: 'update' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @ApiOperation({ summary: 'Upload an event banner (JPEG/PNG/WebP, ≤5MB)' })
  @ApiParam({ name: 'id', example: 1 })
  uploadBanner(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.uploadBanner(user, id, file);
  }

  @Get(':id/banner')
  @RequirePermission({ resource: 'events', action: 'read' })
  @ApiOperation({ summary: 'Download the event banner' })
  @ApiParam({ name: 'id', example: 1 })
  async banner(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Res() res: Response,
  ) {
    const { absolutePath, mime } = await this.svc.bannerForDownload(user, id);
    res.type(mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.sendFile(absolutePath);
  }

  // ─── Registration ────────────────────────────────────────────────────────

  @Post(':id/register')
  @RequirePermission({ resource: 'event_registrations', action: 'create' })
  @ApiOperation({
    summary:
      'Register for an event (alumni: themselves, verified only; staff: pass alumni_id). Enforces deadline, capacity and duplicates atomically',
  })
  @ApiParam({ name: 'id', example: 1 })
  register(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RegisterForEventDto,
  ) {
    return this.registrations.register(user, id, dto);
  }

  @Post(':id/cancel-registration')
  @RequirePermission({ resource: 'event_registrations', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel a registration (frees the seat)' })
  @ApiParam({ name: 'id', example: 1 })
  cancelRegistration(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelRegistrationDto,
  ) {
    return this.registrations.cancelRegistration(user, id, dto);
  }

  @Get(':id/attendees')
  @StaffOnly()
  @RequirePermission({ resource: 'event_registrations', action: 'read' })
  @ApiOperation({
    summary:
      'Attendee list — filter by attendance status (incl. no_show) and payment status',
  })
  @ApiParam({ name: 'id', example: 1 })
  attendees(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Query() query: QueryRegistrationDto,
  ) {
    return this.registrations.listForEvent(user, id, query);
  }

  @Post(':id/attendance')
  @StaffOnly()
  @RequirePermission({ resource: 'event_registrations', action: 'attendance' })
  @ApiOperation({
    summary:
      'Mark / update attendance for one or many registrations (all-or-nothing, audited)',
  })
  @ApiParam({ name: 'id', example: 1 })
  markAttendance(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarkEventAttendanceDto,
  ) {
    return this.registrations.markAttendance(user, id, dto);
  }

  @Post(':id/mark-no-shows')
  @StaffOnly()
  @RequirePermission({ resource: 'event_registrations', action: 'attendance' })
  @ApiOperation({
    summary: 'After the event ends: mark everyone never marked as a no-show',
  })
  @ApiParam({ name: 'id', example: 1 })
  markNoShows(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.registrations.markNoShows(user, id);
  }
}

@ApiTags('Alumni / Event Registrations & Payments')
@ApiBearerAuth()
@UseGuards(...GUARDS)
@Controller('api/alumni/event-registrations')
export class EventRegistrationsController {
  constructor(
    private readonly registrations: RegistrationsService,
    private readonly payments: EventPaymentsService,
  ) {}

  @Get()
  @RequirePermission({ resource: 'event_registrations', action: 'read' })
  @ApiOperation({
    summary: 'Registrations across events (alumni: only their own)',
  })
  findAll(
    @AlumniUser() user: AlumniPlatformUser,
    @Query() query: QueryRegistrationDto,
  ) {
    return this.registrations.findAll(user, query);
  }

  @Get(':id')
  @RequirePermission({ resource: 'event_registrations', action: 'read' })
  @ApiOperation({ summary: 'Get one registration (with its payment)' })
  @ApiParam({ name: 'id', example: 1 })
  findOne(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.registrations.findOne(user, id);
  }

  @Post(':id/payment')
  @StaffOnly()
  @RequirePermission({ resource: 'event_payments', action: 'create' })
  @ApiOperation({
    summary:
      'Record a received ticket payment (staff). Amount must equal the ticket price; one payment per registration',
  })
  @ApiParam({ name: 'id', example: 1 })
  recordPayment(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RecordEventPaymentDto,
  ) {
    return this.payments.record(user, id, dto);
  }

  @Get(':id/payment')
  @RequirePermission({ resource: 'event_payments', action: 'read' })
  @ApiOperation({ summary: 'Get the recorded payment of a registration' })
  @ApiParam({ name: 'id', example: 1 })
  getPayment(
    @AlumniUser() user: AlumniPlatformUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.payments.find(user, id);
  }
}

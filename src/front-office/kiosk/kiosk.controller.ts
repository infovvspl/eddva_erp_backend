import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiQuery } from '@nestjs/swagger';
import { PrismaService } from '../../prisma/prisma.service';
import { VisitorLogsService } from '../visitors/visitor-logs.service';

const TERMINAL_APPOINTMENT_STATUSES = ['cancelled', 'completed', 'no_show'];

/**
 * Unauthenticated lobby-kiosk endpoints (section 34). No Bearer token — a
 * physical kiosk terminal is not a logged-in staff member. Deliberately
 * narrow: identifies an appointment via its id (encoded by the frontend into
 * a QR code — no QR generation/scanning library exists in this project, so
 * none is introduced here; the frontend is free to encode appointment_id
 * into any QR format it likes) plus the phone number on file, and returns
 * only what a visitor standing at a kiosk should see — never other
 * visitors' data, never host contact details, never ID proof.
 */
@ApiTags('Front Office / Kiosk (public, unauthenticated)')
@Controller('api/front-office/kiosk')
export class KioskController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly visitorLogsService: VisitorLogsService,
  ) {}

  private async loadAndVerify(appointmentId: number, phone: string) {
    if (!phone) throw new BadRequestException('phone is required to identify the appointment');
    const appointment = await this.prisma.frontOfficeAppointment.findUnique({
      where: { appointment_id: appointmentId },
      include: { host_employee: { select: { name: true, department: { select: { name: true } } } } },
    });
    if (!appointment) throw new NotFoundException('Appointment not found');
    if (appointment.phone && appointment.phone.replace(/\D/g, '') !== phone.replace(/\D/g, '')) {
      throw new ForbiddenException('Phone number does not match this appointment');
    }
    return appointment;
  }

  @Get('appointments/:id')
  @ApiOperation({ summary: 'Kiosk: look up and validate an appointment for self check-in' })
  @ApiParam({ name: 'id', example: 1 })
  @ApiQuery({ name: 'phone', required: true })
  async lookup(@Param('id', ParseIntPipe) id: number, @Query('phone') phone: string) {
    const appointment = await this.loadAndVerify(id, phone);
    const canCheckIn = !TERMINAL_APPOINTMENT_STATUSES.includes(appointment.status);
    return {
      appointment_id: appointment.appointment_id,
      visitor_name: appointment.visitor_name,
      host_name: appointment.host_employee.name,
      department: appointment.host_employee.department.name,
      appointment_date: appointment.appointment_date,
      start_time: appointment.start_time,
      purpose: appointment.purpose,
      status: appointment.status,
      can_check_in: canCheckIn,
    };
  }

  @Post('appointments/:id/check-in')
  @ApiOperation({ summary: 'Kiosk: self check-in against a validated appointment' })
  @ApiParam({ name: 'id', example: 1 })
  async selfCheckIn(@Param('id', ParseIntPipe) id: number, @Body('phone') phone: string) {
    await this.loadAndVerify(id, phone);
    const log = await this.visitorLogsService.checkIn({ appointment_id: id });
    return {
      badge_number: log.badge_number,
      host_name: log.host_employee.name,
      check_in_time: log.check_in_time,
      status: log.status,
    };
  }
}

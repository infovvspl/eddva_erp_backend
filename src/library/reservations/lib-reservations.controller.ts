import { Controller, Post, Get, Body, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { LibReservationsService } from './lib-reservations.service';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

import { ReservationQueryDto } from './dto/reservation-query.dto';

@ApiTags('Library / Reservations')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('library')
export class LibReservationsController {
  constructor(private readonly reservationsService: LibReservationsService) {}

  @Post('books/:bookId/reserve')
  @RequirePermission({ resource: 'reservations', action: 'reserve' })
  @ApiOperation({ summary: 'Place a hold on a title (librarian)' })
  @ApiParam({ name: 'bookId', description: 'book_id of target Book Title to reserve (e.g. 1)' })
  reserve(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() dto: CreateReservationDto,
  ) {
    return this.reservationsService.create({
      ...dto,
      book_id: dto.book_id ?? bookId,
    });
  }

  @Post('reservations/:id/cancel')
  @RequirePermission({ resource: 'reservations', action: 'cancel' })
  @ApiOperation({ summary: 'Cancel a reservation (librarian)' })
  @ApiParam({ name: 'id', description: 'reservation_id of target Reservation to cancel (e.g. 1)' })
  cancel(@Param('id', ParseIntPipe) id: number) {
    return this.reservationsService.cancel(id);
  }

  @Get('reservations')
  @RequirePermission({ resource: 'reservations', action: 'read' })
  @ApiOperation({ summary: 'List reservations — filterable by optional status (librarian)' })
  findAll(@Query() query: ReservationQueryDto) {
    return this.reservationsService.findAll(query.status);
  }
}

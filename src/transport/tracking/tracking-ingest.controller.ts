import { Body, Controller, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { IngestLocationDto } from './dto/ingest-location.dto';

/**
 * Unauthenticated GPS ingestion endpoint — mirrors the source project's
 * design exactly (see TrackingService.ingestLocationPing doc comment):
 * a real deployment would use a device-specific token, not a Bearer/RBAC
 * check, since the caller is a GPS unit, not a logged-in staff member.
 * Kept deliberately separate from TrackingController so it never picks up
 * the JWT/permissions guards applied there.
 */
@ApiTags('Transport / Tracking (public, unauthenticated ingestion)')
@Controller('api/transport/tracking')
export class TrackingIngestController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post('ingest/:vehicleId')
  @ApiOperation({ summary: 'Ingest a GPS location ping from a vehicle device' })
  @ApiResponse({ status: 201, description: 'Location ping recorded successfully.' })
  ingestLocation(@Param('vehicleId', ParseIntPipe) vehicleId: number, @Body() dto: IngestLocationDto) {
    return this.trackingService.ingestLocationPing(vehicleId, dto);
  }
}

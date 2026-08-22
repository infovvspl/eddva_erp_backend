import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { LibCopiesService } from './lib-copies.service';
import { BarcodeService } from './barcode.service';
import { CreateCopyDto } from './dto/create-copy.dto';
import { UpdateCopyDto } from './dto/update-copy.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Library / Copies & Barcode')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('library')
export class LibCopiesController {
  constructor(
    private readonly copiesService: LibCopiesService,
    private readonly barcodeService: BarcodeService,
  ) {}

  @Post('books/:bookId/copies')
  @RequirePermission({ resource: 'copies', action: 'create' })
  @ApiOperation({ summary: 'Add physical copy to a book title (librarian)' })
  @ApiParam({ name: 'bookId', description: 'book_id of target Book Title (e.g. 1)' })
  create(
    @Param('bookId', ParseIntPipe) bookId: number,
    @Body() dto: CreateCopyDto,
  ) {
    return this.copiesService.create(bookId, dto);
  }

  @Get('books/:bookId/copies')
  @RequirePermission({ resource: 'copies', action: 'read' })
  @ApiOperation({ summary: 'List all physical copies of a title (librarian)' })
  @ApiParam({ name: 'bookId', description: 'book_id of target Book Title (e.g. 1)' })
  findByBook(@Param('bookId', ParseIntPipe) bookId: number) {
    return this.copiesService.findByBook(bookId);
  }

  @Get('copies/scan/:barcode')
  @RequirePermission({ resource: 'copies', action: 'read' })
  @ApiOperation({
    summary: 'Resolve barcode → copy details + current status (librarian)',
    description: 'Barcode scan endpoint. Returns copy_id, book info, status, and current_issue_id. Frontend uses copy_id to drive issue or return.',
  })
  @ApiParam({ name: 'barcode', description: 'barcode string scanned from physical book (e.g. BC-CC-001)' })
  scan(@Param('barcode') barcode: string) {
    return this.barcodeService.resolve(barcode);
  }

  @Patch('copies/:id')
  @RequirePermission({ resource: 'copies', action: 'update' })
  @ApiOperation({ summary: 'Update copy condition / location / status (librarian)' })
  @ApiParam({ name: 'id', description: 'copy_id of the physical Book Copy to update (e.g. 1)' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCopyDto,
  ) {
    return this.copiesService.update(id, dto);
  }
}

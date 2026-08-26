import { Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { LibBookVendorsService } from './lib-book-vendors.service';
import { CreateBookVendorDto } from './dto/create-book-vendor.dto';
import { UpdateBookVendorDto } from './dto/update-book-vendor.dto';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';

@ApiTags('Library / Book Vendors')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library')
export class LibBookVendorsController {
  constructor(private readonly vendorsService: LibBookVendorsService) {}

  @Post('books/:bookId/vendors')
  @RequirePermission({ resource: 'vendors', action: 'create' })
  @ApiOperation({ summary: 'Add vendor for a book title (admin)' })
  @ApiParam({ name: 'bookId', description: 'book_id of target Catalog Book (e.g. 1)' })
  create(@Param('bookId', ParseIntPipe) bookId: number, @Body() dto: CreateBookVendorDto) {
    return this.vendorsService.create(bookId, dto);
  }

  @Get('books/:bookId/vendors')
  @RequirePermission({ resource: 'vendors', action: 'read' })
  @ApiOperation({ summary: 'List vendors for a book title (librarian)' })
  @ApiParam({ name: 'bookId', description: 'book_id of target Catalog Book (e.g. 1)' })
  findByBook(@Param('bookId', ParseIntPipe) bookId: number) {
    return this.vendorsService.findByBook(bookId);
  }

  @Patch('book-vendors/:id')
  @RequirePermission({ resource: 'vendors', action: 'update' })
  @ApiOperation({ summary: 'Update vendor / price (admin)' })
  @ApiParam({ name: 'id', description: 'vendor_id of the Book Vendor mapping to update (e.g. 1)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBookVendorDto) {
    return this.vendorsService.update(id, dto);
  }

  @Delete('book-vendors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission({ resource: 'vendors', action: 'delete' })
  @ApiOperation({ summary: 'Remove a vendor from a book title (admin)' })
  @ApiParam({ name: 'id', description: 'book_vendor_id of the Book Vendor mapping to delete (e.g. 1)' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.vendorsService.remove(id);
  }
}

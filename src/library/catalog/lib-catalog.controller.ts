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
  UseInterceptors,
  UploadedFile,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { LibCatalogService } from './lib-catalog.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LibJwtGuard } from '../auth/lib-jwt.guard';
import { LibInstituteAdminViewOnlyGuard } from '../auth/lib-institute-admin-view-only.guard';
import { LibPermissionsGuard } from '../auth/lib-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { LibUser } from '../auth/lib-user.decorator';
import type { LibPlatformUser } from '../auth/lib-auth.service';

@ApiTags('Library / Catalog')
@ApiBearerAuth()
@UseGuards(LibJwtGuard, LibInstituteAdminViewOnlyGuard, LibPermissionsGuard)
@Controller('api/library/books')
export class LibCatalogController {
  private s3 = new S3Client({ region: process.env.AWS_REGION ?? 'ap-south-1' });

  constructor(private readonly catalogService: LibCatalogService) {}

  @Post()
  @RequirePermission({ resource: 'catalog', action: 'create' })
  @ApiOperation({ summary: 'Add new book title to catalog (librarian)' })
  create(@LibUser() user: LibPlatformUser, @Body() dto: CreateBookDto) {
    return this.catalogService.create(user.institute_id, dto);
  }

  @Get()
  @RequirePermission({ resource: 'catalog', action: 'read' })
  @ApiOperation({ summary: 'Browse catalog (public, paginated)' })
  findAll(@LibUser() user: LibPlatformUser, @Query() query: BookQueryDto) {
    return this.catalogService.findAll(user.institute_id, query);
  }

  @Get('search')
  @RequirePermission({ resource: 'catalog', action: 'read' })
  @ApiOperation({ summary: 'Search catalog by title / author / ISBN (public)' })
  search(@LibUser() user: LibPlatformUser, @Query('q') q: string) {
    if (!q || q.trim().length < 2) {
      throw new BadRequestException('Search query must be at least 2 characters');
    }
    return this.catalogService.search(user.institute_id, q.trim());
  }

  @Get(':id')
  @RequirePermission({ resource: 'catalog', action: 'read' })
  @ApiOperation({ summary: 'Get book detail with available copy count (public)' })
  @ApiParam({ name: 'id', description: 'book_id of the Catalog Book Title (e.g. 1)' })
  findOne(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.catalogService.findOne(user.institute_id, id);
  }

  @Patch(':id')
  @RequirePermission({ resource: 'catalog', action: 'update' })
  @ApiOperation({ summary: 'Update catalog entry (librarian)' })
  @ApiParam({ name: 'id', description: 'book_id of the Catalog Book Title to update (e.g. 1)' })
  update(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBookDto,
  ) {
    return this.catalogService.update(user.institute_id, id, dto);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'catalog', action: 'delete' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove title — requires catalog delete permission' })
  @ApiParam({ name: 'id', description: 'book_id of the Catalog Book Title to delete (e.g. 1)' })
  remove(@LibUser() user: LibPlatformUser, @Param('id', ParseIntPipe) id: number) {
    return this.catalogService.remove(user.institute_id, id);
  }

  @Post(':id/cover')
  @RequirePermission({ resource: 'catalog', action: 'update' })
  @ApiOperation({ summary: 'Upload book cover image to S3 (librarian)' })
  @ApiParam({ name: 'id', description: 'book_id of target Catalog Book (e.g. 1)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  async uploadCover(
    @LibUser() user: LibPlatformUser,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');

    // 1. Verify book exists first
    await this.catalogService.findOne(user.institute_id, id);

    // 2. Verify S3 configuration
    const bucket = process.env.AWS_S3_BUCKET;
    if (!bucket || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      throw new BadRequestException(
        'AWS S3 is not configured. Please set AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, and AWS_SECRET_ACCESS_KEY in .env',
      );
    }

    try {
      const key = `library/covers/${id}-${Date.now()}-${file.originalname}`;
      await this.s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
      const coverUrl = `https://${bucket}.s3.${process.env.AWS_REGION ?? 'ap-south-1'}.amazonaws.com/${key}`;
      return await this.catalogService.updateCoverImage(user.institute_id, id, coverUrl);
    } catch (err: any) {
      throw new BadRequestException(`S3 Upload failed: ${err.message || err}`);
    }
  }
}

import { Body, Controller, Delete, ForbiddenException, Get, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { FrontOfficeJwtGuard } from '../auth/front-office-jwt.guard';
import { FrontOfficeInstituteAdminViewOnlyGuard } from '../auth/front-office-institute-admin-view-only.guard';
import { FrontOfficePermissionsGuard } from '../auth/front-office-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { FrontOfficeUser } from '../auth/front-office-user.decorator';
import type { FrontOfficePlatformUser } from '../auth/front-office-auth.service';
import { FrontOfficeAccessService, isFoAdmin } from '../common/front-office-access.service';
import { AttachmentsService } from './attachments.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

const VIEW_RESOURCE_BY_ENTITY: Record<string, string> = {
  visitor: 'visitors',
  enquiry: 'enquiries',
  complaint: 'complaints',
};

@ApiTags('Front Office / Attachments')
@ApiBearerAuth()
@UseGuards(FrontOfficeJwtGuard, FrontOfficeInstituteAdminViewOnlyGuard, FrontOfficePermissionsGuard)
@Controller('api/front-office/attachments')
export class AttachmentsController {
  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly access: FrontOfficeAccessService,
  ) {}

  private async assertCanAccessEntity(user: FrontOfficePlatformUser, entityType: string) {
    if (isFoAdmin(user)) return;
    const resource = VIEW_RESOURCE_BY_ENTITY[entityType];
    const canView = await this.access.hasPermission(user, resource, 'read');
    const canManage = await this.access.hasPermission(user, 'attachments', 'manage');
    if (!canView && !canManage) {
      throw new ForbiddenException(`You do not have permission to access ${entityType} attachments`);
    }
  }

  @Post()
  @RequirePermission({ resource: 'attachments', action: 'manage' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, entity_type: { type: 'string' }, entity_id: { type: 'number' } } } })
  @ApiOperation({ summary: 'Upload an attachment for a visitor, enquiry, or complaint' })
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: CreateAttachmentDto, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.attachmentsService.upload(file, dto, user.eddva_user_id);
  }

  @Get()
  @ApiOperation({ summary: 'List attachments for an entity' })
  @ApiQuery({ name: 'entity_type', required: false })
  @ApiQuery({ name: 'entity_id', required: false })
  async findAll(@FrontOfficeUser() user: FrontOfficePlatformUser, @Query('entity_type') entityType?: string, @Query('entity_id') entityId?: string) {
    if (entityType) {
      await this.assertCanAccessEntity(user, entityType);
    } else {
      const canManage = isFoAdmin(user) || (await this.access.hasPermission(user, 'attachments', 'manage'));
      if (!canManage) {
        throw new ForbiddenException('Filter by entity_type, or hold the attachments:manage permission to list across all entities');
      }
    }
    return this.attachmentsService.findAll(entityType, entityId ? Number(entityId) : undefined);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attachment metadata' })
  @ApiParam({ name: 'id', example: 1 })
  async findOne(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    const attachment = await this.attachmentsService.findOne(id);
    await this.assertCanAccessEntity(user, attachment.entity_type);
    return attachment;
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download an attachment file' })
  @ApiParam({ name: 'id', example: 1 })
  async download(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser, @Res() res: Response) {
    const { attachment, absolutePath } = await this.attachmentsService.getFileForDownload(id);
    await this.assertCanAccessEntity(user, attachment.entity_type);
    res.download(absolutePath, attachment.file_name);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'attachments', action: 'manage' })
  @ApiOperation({ summary: 'Delete an attachment' })
  @ApiParam({ name: 'id', example: 1 })
  remove(@Param('id', ParseIntPipe) id: number, @FrontOfficeUser() user: FrontOfficePlatformUser) {
    return this.attachmentsService.remove(id, user.eddva_user_id);
  }
}

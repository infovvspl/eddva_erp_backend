import { Body, Controller, Delete, Get, Param, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiConsumes, ApiParam, ApiQuery, ApiBody } from '@nestjs/swagger';
import type { Response } from 'express';
import { AccountsJwtGuard } from '../auth/accounts-jwt.guard';
import { AccountsInstituteAdminViewOnlyGuard } from '../auth/accounts-institute-admin-view-only.guard';
import { AccountsPermissionsGuard } from '../auth/accounts-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AccountsUser } from '../auth/accounts-user.decorator';
import type { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { VoucherAttachmentsService } from './attachments.service';
import { CreateVoucherAttachmentDto } from './dto/create-attachment.dto';

@ApiTags('Accounts / Voucher Attachments')
@ApiBearerAuth()
@UseGuards(AccountsJwtGuard, AccountsInstituteAdminViewOnlyGuard, AccountsPermissionsGuard)
@Controller('api/accounts/attachments')
export class VoucherAttachmentsController {
  constructor(private readonly attachmentsService: VoucherAttachmentsService) {}

  @Post()
  @RequirePermission({ resource: 'attachments', action: 'manage' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, voucherId: { type: 'string' } } } })
  @ApiOperation({ summary: 'Upload an attachment for a voucher' })
  upload(@UploadedFile() file: Express.Multer.File, @Body() dto: CreateVoucherAttachmentDto, @AccountsUser() user: AccountsPlatformUser) {
    return this.attachmentsService.upload(file, dto, user);
  }

  @Get()
  @RequirePermission({ resource: 'attachments', action: 'read' })
  @ApiOperation({ summary: 'List attachments for a voucher' })
  @ApiQuery({ name: 'voucherId', required: true })
  findAll(@AccountsUser() user: AccountsPlatformUser, @Query('voucherId') voucherId: string) {
    return this.attachmentsService.findAll(voucherId, user);
  }

  @Get(':id/download')
  @RequirePermission({ resource: 'attachments', action: 'read' })
  @ApiOperation({ summary: 'Download an attachment file' })
  @ApiParam({ name: 'id' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const { absolutePath } = await this.attachmentsService.getFileForDownload(id);
    res.download(absolutePath);
  }

  @Delete(':id')
  @RequirePermission({ resource: 'attachments', action: 'manage' })
  @ApiOperation({ summary: 'Delete a voucher attachment' })
  @ApiParam({ name: 'id' })
  remove(@Param('id') id: string, @AccountsUser() user: AccountsPlatformUser) {
    return this.attachmentsService.remove(id, user);
  }
}

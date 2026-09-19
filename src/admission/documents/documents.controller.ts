import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AdmissionJwtGuard } from '../auth/admission-jwt.guard';
import { AdmissionInstituteAdminViewOnlyGuard } from '../auth/admission-institute-admin-view-only.guard';
import { AdmissionPermissionsGuard } from '../auth/admission-permissions.guard';
import { RequirePermission } from '../auth/require-permissions.decorator';
import { AdmissionUser } from '../auth/admission-user.decorator';
import type { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { DocumentsService } from './documents.service';
import { RejectDocumentDto, UploadDocumentDto } from './dto/document.dto';

@ApiTags('Admission / Application Documents')
@ApiBearerAuth()
@UseGuards(
  AdmissionJwtGuard,
  AdmissionInstituteAdminViewOnlyGuard,
  AdmissionPermissionsGuard,
)
@Controller('api/admission/applications/:applicationId/documents')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Post()
  @RequirePermission({ resource: 'documents', action: 'upload' })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        document_type: {
          type: 'string',
          enum: [
            'birth_certificate',
            'previous_marksheet',
            'transfer_certificate',
            'id_proof',
            'photo',
            'other',
          ],
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload an application document (PDF/JPEG/PNG/WebP, ≤10MB)',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  upload(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.svc.upload(user, applicationId, file, dto);
  }

  @Get()
  @RequirePermission({ resource: 'documents', action: 'read' })
  @ApiOperation({
    summary: 'List documents of an application with verification status',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  findAll(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
  ) {
    return this.svc.findAll(user.institute_id, applicationId);
  }

  @Get(':documentId')
  @RequirePermission({ resource: 'documents', action: 'read' })
  @ApiOperation({
    summary: 'Get document metadata (uploader, verifier, timestamps)',
  })
  @ApiParam({ name: 'applicationId', example: 1 })
  @ApiParam({ name: 'documentId', example: 1 })
  findOne(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.svc.findOne(user.institute_id, applicationId, documentId);
  }

  @Get(':documentId/download')
  @RequirePermission({ resource: 'documents', action: 'read' })
  @ApiOperation({ summary: 'Download / preview the document file' })
  @ApiParam({ name: 'applicationId', example: 1 })
  @ApiParam({ name: 'documentId', example: 1 })
  async download(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Res() res: Response,
  ) {
    const { document, absolutePath } = await this.svc.getFileForDownload(
      user.institute_id,
      applicationId,
      documentId,
    );
    res.type(document.mime_type);
    res.download(absolutePath, document.file_name);
  }

  @Post(':documentId/verify')
  @RequirePermission({ resource: 'documents', action: 'verify' })
  @ApiOperation({ summary: 'Verify a pending document' })
  @ApiParam({ name: 'applicationId', example: 1 })
  @ApiParam({ name: 'documentId', example: 1 })
  verify(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
  ) {
    return this.svc.verify(user, applicationId, documentId);
  }

  @Post(':documentId/reject')
  @RequirePermission({ resource: 'documents', action: 'reject' })
  @ApiOperation({ summary: 'Reject a pending document (reason required)' })
  @ApiParam({ name: 'applicationId', example: 1 })
  @ApiParam({ name: 'documentId', example: 1 })
  reject(
    @AdmissionUser() user: AdmissionPlatformUser,
    @Param('applicationId', ParseIntPipe) applicationId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: RejectDocumentDto,
  ) {
    return this.svc.reject(user, applicationId, documentId, dto);
  }
}

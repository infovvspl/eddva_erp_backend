import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { requireInstituteId } from '../../common/utils/require-institute.util';
import { FrontOfficeAuditService } from '../common/front-office-audit.service';
import { FO_ENTITY } from '../common/front-office-entities';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'front-office');
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: FrontOfficeAuditService,
  ) {}

  /** entity_type/entity_id is a polymorphic reference with no DB-level FK, so ownership
   * of the target entity is checked here, scoped to the caller's institute. */
  private async assertEntityExists(instituteId: string, entityType: string, entityId: number) {
    switch (entityType) {
      case 'visitor': {
        const row = await this.prisma.frontOfficeVisitor.findFirst({ where: { visitor_id: entityId, institute_id: instituteId } });
        if (!row) throw new NotFoundException(`Visitor #${entityId} not found`);
        return;
      }
      case 'enquiry': {
        const row = await this.prisma.frontOfficeEnquiry.findFirst({ where: { enquiry_id: entityId, institute_id: instituteId } });
        if (!row) throw new NotFoundException(`Enquiry #${entityId} not found`);
        return;
      }
      case 'complaint': {
        const row = await this.prisma.frontOfficeComplaint.findFirst({ where: { complaint_id: entityId, institute_id: instituteId } });
        if (!row) throw new NotFoundException(`Complaint #${entityId} not found`);
        return;
      }
      default:
        throw new BadRequestException(`Unsupported attachment entity_type "${entityType}"`);
    }
  }

  async upload(instituteId: string, file: Express.Multer.File, dto: CreateAttachmentDto, actorId?: string) {
    const institute_id = requireInstituteId(instituteId);
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 10MB size limit');
    }

    await this.assertEntityExists(institute_id, dto.entity_type, dto.entity_id);

    const dir = path.join(UPLOAD_ROOT, dto.entity_type, String(dto.entity_id));
    fs.mkdirSync(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path.join(dir, safeName);
    fs.writeFileSync(fullPath, file.buffer);

    const attachment = await this.prisma.frontOfficeAttachment.create({
      data: {
        institute_id,
        entity_type: dto.entity_type as any,
        entity_id: dto.entity_id,
        file_name: file.originalname,
        file_url: path.relative(process.cwd(), fullPath).split(path.sep).join('/'),
        mime_type: file.mimetype,
        size_bytes: file.size,
        uploaded_by: actorId,
      },
    });

    await this.audit.log({
      userId: actorId,
      entityType: FO_ENTITY.ATTACHMENT,
      entityId: String(attachment.attachment_id),
      action: 'upload',
      metadata: { entity_type: dto.entity_type, entity_id: dto.entity_id, file_name: file.originalname },
    });

    return attachment;
  }

  async findAll(instituteId: string, entityType?: string, entityId?: number) {
    return this.prisma.frontOfficeAttachment.findMany({
      where: { institute_id: requireInstituteId(instituteId), entity_type: entityType as any, entity_id: entityId },
      orderBy: { uploaded_at: 'desc' },
    });
  }

  async findOne(instituteId: string, id: number) {
    const attachment = await this.prisma.frontOfficeAttachment.findFirst({ where: { attachment_id: id, institute_id: requireInstituteId(instituteId) } });
    if (!attachment) throw new NotFoundException(`Attachment #${id} not found`);
    return attachment;
  }

  async getFileForDownload(instituteId: string, id: number) {
    const attachment = await this.findOne(instituteId, id);
    const absolutePath = path.join(process.cwd(), attachment.file_url);
    if (!fs.existsSync(absolutePath)) {
      throw new NotFoundException('The stored file could not be found on disk');
    }
    return { attachment, absolutePath };
  }

  async remove(instituteId: string, id: number, actorId?: string) {
    const attachment = await this.findOne(instituteId, id);
    const absolutePath = path.join(process.cwd(), attachment.file_url);
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch {
      /* best-effort disk cleanup — DB record removal is authoritative */
    }
    await this.prisma.frontOfficeAttachment.delete({ where: { attachment_id: id } });
    await this.audit.log({ userId: actorId, entityType: FO_ENTITY.ATTACHMENT, entityId: String(id), action: 'delete' });
    return { deleted: true };
  }
}

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BadRequestException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AdmissionApplicationDocument } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AdmissionPlatformUser } from '../auth/admission-auth.service';
import { AdmissionAuditService } from '../common/admission-audit.service';
import { AdmissionLookupService } from '../common/admission-lookup.service';
import { ADM_ENTITY } from '../common/admission-entities';
import { BusinessException } from '../common/business-exception';
import { RejectDocumentDto, UploadDocumentDto } from './dto/document.dto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'admission');
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_MIME_TYPES = new Set([...IMAGE_MIME_TYPES, 'application/pdf']);
const CLOSED_STATUSES = ['cancelled', 'rejected', 'admitted'];

/** Magic-number check so a file cannot claim a MIME type it is not. */
function matchesSignature(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case 'application/pdf':
      return buf.subarray(0, 4).toString('latin1') === '%PDF';
    case 'image/png':
      return buf
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp':
      return (
        buf.subarray(0, 4).toString('latin1') === 'RIFF' &&
        buf.subarray(8, 12).toString('latin1') === 'WEBP'
      );
    default:
      return false;
  }
}

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookup: AdmissionLookupService,
    private readonly audit: AdmissionAuditService,
  ) {}

  async upload(
    actor: AdmissionPlatformUser,
    applicationId: number,
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
  ) {
    const application = await this.lookup.application(
      actor.institute_id,
      applicationId,
    );
    if (CLOSED_STATUSES.includes(application.status)) {
      throw new BusinessException(
        'APPLICATION_CLOSED',
        `Documents cannot be added to an application in status "${application.status}".`,
        { status: application.status },
      );
    }
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed (PDF, JPEG, PNG, WebP)`,
      );
    }
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds the 10MB size limit');
    }
    if (dto.document_type === 'photo' && !IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'A photo must be a JPEG, PNG or WebP image',
      );
    }
    if (!matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match its declared type',
      );
    }

    const dir = path.join(UPLOAD_ROOT, 'applications', String(applicationId));
    await fs.mkdir(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path.join(dir, safeName);
    await fs.writeFile(fullPath, file.buffer);

    let document: AdmissionApplicationDocument;
    try {
      document = await this.prisma.admissionApplicationDocument.create({
        data: {
          application_id: applicationId,
          document_type: dto.document_type,
          file_name: file.originalname,
          file_url: path
            .relative(process.cwd(), fullPath)
            .split(path.sep)
            .join('/'),
          mime_type: file.mimetype,
          size_bytes: file.size,
          uploaded_by: actor.eddva_user_id,
        },
      });
    } catch (err) {
      await fs.unlink(fullPath).catch(() => undefined); // don't orphan the file if the row failed
      throw err;
    }

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.DOCUMENT,
      entityId: String(document.document_id),
      action: 'upload',
      newStatus: document.verification_status,
      metadata: {
        application_id: applicationId,
        document_type: dto.document_type,
        file_name: file.originalname,
      },
    });
    return document;
  }

  async findAll(instituteId: string, applicationId: number) {
    await this.lookup.application(instituteId, applicationId);
    return this.prisma.admissionApplicationDocument.findMany({
      where: { application_id: applicationId },
      orderBy: { uploaded_at: 'desc' },
    });
  }

  async findOne(
    instituteId: string,
    applicationId: number,
    documentId: number,
  ) {
    await this.lookup.application(instituteId, applicationId);
    const document = await this.prisma.admissionApplicationDocument.findFirst({
      where: { document_id: documentId, application_id: applicationId },
    });
    if (!document)
      throw new NotFoundException(`Document #${documentId} not found`);
    return document;
  }

  async getFileForDownload(
    instituteId: string,
    applicationId: number,
    documentId: number,
  ) {
    const document = await this.findOne(instituteId, applicationId, documentId);
    const absolutePath = path.resolve(process.cwd(), document.file_url);
    // Defence in depth: never serve anything outside the admission upload root.
    if (!absolutePath.startsWith(UPLOAD_ROOT + path.sep)) {
      throw new NotFoundException('The stored file could not be found');
    }
    try {
      await fs.access(absolutePath);
    } catch {
      throw new NotFoundException('The stored file could not be found on disk');
    }
    return { document, absolutePath };
  }

  /**
   * Verify / reject are decisions on a `pending` document only. The guarded
   * `updateMany` makes a concurrent double-decision a 409 instead of silently
   * overwriting the first reviewer's decision.
   */
  private async decide(
    actor: AdmissionPlatformUser,
    applicationId: number,
    documentId: number,
    decision: 'verified' | 'rejected',
    reason?: string,
  ) {
    const application = await this.lookup.application(
      actor.institute_id,
      applicationId,
    );
    if (CLOSED_STATUSES.includes(application.status)) {
      throw new BusinessException(
        'APPLICATION_CLOSED',
        `Documents on an application in status "${application.status}" can no longer be reviewed.`,
        { status: application.status },
      );
    }
    const document = await this.findOne(
      actor.institute_id,
      applicationId,
      documentId,
    );

    const result = await this.prisma.admissionApplicationDocument.updateMany({
      where: { document_id: documentId, verification_status: 'pending' },
      data: {
        verification_status: decision,
        verified_by: actor.eddva_user_id,
        verified_at: new Date(),
        rejection_reason: decision === 'rejected' ? reason : null,
      },
    });
    if (result.count === 0) {
      const current =
        await this.prisma.admissionApplicationDocument.findUniqueOrThrow({
          where: { document_id: documentId },
          select: { verification_status: true },
        });
      throw new BusinessException(
        'DOCUMENT_ALREADY_DECIDED',
        `This document has already been ${current.verification_status}.`,
        { verification_status: current.verification_status },
        HttpStatus.CONFLICT,
      );
    }

    await this.audit.log(actor, {
      entityType: ADM_ENTITY.DOCUMENT,
      entityId: String(documentId),
      action: decision === 'verified' ? 'verify' : 'reject',
      oldStatus: document.verification_status,
      newStatus: decision,
      reason,
      metadata: {
        application_id: applicationId,
        document_type: document.document_type,
      },
    });
    return this.prisma.admissionApplicationDocument.findUniqueOrThrow({
      where: { document_id: documentId },
    });
  }

  verify(
    actor: AdmissionPlatformUser,
    applicationId: number,
    documentId: number,
  ) {
    return this.decide(actor, applicationId, documentId, 'verified');
  }

  reject(
    actor: AdmissionPlatformUser,
    applicationId: number,
    documentId: number,
    dto: RejectDocumentDto,
  ) {
    return this.decide(
      actor,
      applicationId,
      documentId,
      'rejected',
      dto.reason,
    );
  }
}

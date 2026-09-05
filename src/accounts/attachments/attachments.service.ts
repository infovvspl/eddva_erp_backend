import * as fs from 'fs';
import * as path from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AccountsAuditService } from '../common/accounts-audit.service';
import { ACCOUNTS_ENTITY } from '../common/accounts-entities';
import { AccountsPlatformUser } from '../auth/accounts-auth.service';
import { CreateVoucherAttachmentDto } from './dto/create-attachment.dto';

const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'accounts');
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

@Injectable()
export class VoucherAttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AccountsAuditService,
  ) {}

  async upload(file: Express.Multer.File, dto: CreateVoucherAttachmentDto, actor: AccountsPlatformUser) {
    const { eddva_user_id: userId, institute_id: instituteId } = actor;
    if (!file) throw new BadRequestException('file is required');
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) throw new BadRequestException(`File type "${file.mimetype}" is not allowed`);
    if (file.size > MAX_SIZE_BYTES) throw new BadRequestException('File exceeds the 10MB size limit');

    const voucher = await this.prisma.voucher.findFirst({ where: { id: dto.voucherId, instituteId } });
    if (!voucher) throw new NotFoundException(`Voucher ${dto.voucherId} not found`);

    const dir = path.join(UPLOAD_ROOT, voucher.id);
    fs.mkdirSync(dir, { recursive: true });
    const safeName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const fullPath = path.join(dir, safeName);
    fs.writeFileSync(fullPath, file.buffer);

    const attachment = await this.prisma.voucherAttachment.create({
      data: {
        voucherId: voucher.id,
        fileUrl: path.relative(process.cwd(), fullPath).split(path.sep).join('/'),
        uploadedBy: userId,
      },
    });

    await this.auditService.log({
      userId,
      entityType: ACCOUNTS_ENTITY.VOUCHER_ATTACHMENT,
      entityId: attachment.id,
      action: 'UPLOAD',
      metadata: { voucherId: voucher.id, fileName: file.originalname },
    });

    return attachment;
  }

  async findAll(voucherId: string, actor: AccountsPlatformUser) {
    const voucher = await this.prisma.voucher.findFirst({ where: { id: voucherId, instituteId: actor.institute_id } });
    if (!voucher) throw new NotFoundException(`Voucher ${voucherId} not found`);
    return this.prisma.voucherAttachment.findMany({ where: { voucherId }, orderBy: { uploadedAt: 'desc' } });
  }

  private async findOne(id: string) {
    const attachment = await this.prisma.voucherAttachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundException(`Attachment ${id} not found`);
    return attachment;
  }

  async getFileForDownload(id: string) {
    const attachment = await this.findOne(id);
    const absolutePath = path.join(process.cwd(), attachment.fileUrl);
    if (!fs.existsSync(absolutePath)) throw new NotFoundException('The stored file could not be found on disk');
    return { attachment, absolutePath };
  }

  async remove(id: string, actor: AccountsPlatformUser) {
    const userId = actor.eddva_user_id;
    const attachment = await this.findOne(id);
    const absolutePath = path.join(process.cwd(), attachment.fileUrl);
    try {
      if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
    } catch {
      /* best-effort disk cleanup — the DB record removal below is authoritative */
    }
    await this.prisma.voucherAttachment.delete({ where: { id } });
    await this.auditService.log({ userId, entityType: ACCOUNTS_ENTITY.VOUCHER_ATTACHMENT, entityId: id, action: 'DELETE' });
    return { deleted: true };
  }
}

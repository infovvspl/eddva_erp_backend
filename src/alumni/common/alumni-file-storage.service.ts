import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

export type AlumniFileKind = 'photos' | 'resumes' | 'banners';

export interface FileRules {
  mimes: readonly string[];
  maxBytes: number;
  label: string;
}

export const IMAGE_RULES: FileRules = {
  mimes: ['image/jpeg', 'image/png', 'image/webp'],
  maxBytes: 2 * 1024 * 1024,
  label: 'JPEG, PNG or WebP image up to 2MB',
};
export const BANNER_RULES: FileRules = {
  ...IMAGE_RULES,
  maxBytes: 5 * 1024 * 1024,
  label: 'JPEG, PNG or WebP image up to 5MB',
};
export const RESUME_RULES: FileRules = {
  mimes: [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  maxBytes: 5 * 1024 * 1024,
  label: 'PDF or DOCX up to 5MB',
};

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'docx',
};

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'alumni');

/** Magic-number check so a file cannot claim a MIME type it is not. */
export function matchesSignature(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case 'application/pdf':
      return buf.subarray(0, 4).toString('latin1') === '%PDF';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return buf.subarray(0, 4).equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
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

/**
 * Local-disk storage (the ERP convention: Front Office and Admission store
 * under `uploads/`). Files are written under a server-generated name — the
 * client's file name is never used in a path — inside a per-institute folder,
 * and are only ever served through authorised controller endpoints, never as
 * static files.
 */
@Injectable()
export class AlumniFileStorageService {
  private folder(instituteId: string, kind: AlumniFileKind): string {
    // institute_id is free text; hash it so it can never influence the path.
    const inst = createHash('sha256')
      .update(instituteId)
      .digest('hex')
      .slice(0, 16);
    return path.join(UPLOAD_ROOT, inst, kind);
  }

  /** Validates size/type/content and stores the file; returns the stored path relative to cwd. */
  async save(
    instituteId: string,
    kind: AlumniFileKind,
    file: Express.Multer.File | undefined,
    rules: FileRules,
  ): Promise<{ path: string; mime: string; size: number }> {
    if (!file) throw new BadRequestException('file is required');
    if (!rules.mimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type "${file.mimetype}" is not allowed (${rules.label})`,
      );
    }
    if (file.size > rules.maxBytes) {
      throw new BadRequestException(`File exceeds the limit (${rules.label})`);
    }
    if (!matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException(
        'File content does not match its declared type',
      );
    }
    const dir = this.folder(instituteId, kind);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(
      dir,
      `${randomUUID()}.${EXTENSION[file.mimetype]}`,
    );
    await fs.writeFile(fullPath, file.buffer);
    return {
      path: path.relative(process.cwd(), fullPath).split(path.sep).join('/'),
      mime: file.mimetype,
      size: file.size,
    };
  }

  /** Absolute path of a stored file; refuses anything outside the alumni upload root. */
  resolve(relativePath: string): string {
    const absolute = path.resolve(process.cwd(), relativePath);
    if (!absolute.startsWith(UPLOAD_ROOT + path.sep)) {
      throw new NotFoundException('File not found');
    }
    return absolute;
  }

  async exists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.resolve(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /** Best-effort delete (used when a row insert fails, or a file is replaced). */
  async remove(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    try {
      await fs.unlink(this.resolve(relativePath));
    } catch {
      // Already gone or outside the root — nothing to clean up.
    }
  }
}

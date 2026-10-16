import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

export type InventoryFileKind = 'item-images';

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

const EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export const UPLOAD_ROOT = path.join(process.cwd(), 'uploads', 'inventory');

/** Magic-number check so a file cannot claim a MIME type it is not. */
export function matchesSignature(buf: Buffer, mime: string): boolean {
  switch (mime) {
    case 'image/png':
      return buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/jpeg':
      return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    case 'image/webp':
      return buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP';
    default:
      return false;
  }
}

/**
 * Local-disk storage, same convention as Alumni's AlumniFileStorageService:
 * files are written under a server-generated name inside a per-institute
 * (hashed) folder, and are only ever served through the authorised
 * `GET /api/inventory/items/image` endpoint — never as static files.
 */
@Injectable()
export class InventoryFileStorageService {
  private instituteFolderHash(instituteId: string): string {
    return createHash('sha256').update(instituteId).digest('hex').slice(0, 16);
  }

  private folder(instituteId: string, kind: InventoryFileKind): string {
    return path.join(UPLOAD_ROOT, this.instituteFolderHash(instituteId), kind);
  }

  /** Validates size/type/content and stores the file; returns the stored path relative to cwd. */
  async save(
    instituteId: string,
    kind: InventoryFileKind,
    file: Express.Multer.File | undefined,
    rules: FileRules,
  ): Promise<{ path: string; mime: string; size: number }> {
    if (!file) throw new BadRequestException('file is required');
    if (!rules.mimes.includes(file.mimetype)) {
      throw new BadRequestException(`File type "${file.mimetype}" is not allowed (${rules.label})`);
    }
    if (file.size > rules.maxBytes) {
      throw new BadRequestException(`File exceeds the limit (${rules.label})`);
    }
    if (!matchesSignature(file.buffer, file.mimetype)) {
      throw new BadRequestException('File content does not match its declared type');
    }
    const dir = this.folder(instituteId, kind);
    await fs.mkdir(dir, { recursive: true });
    const fullPath = path.join(dir, `${randomUUID()}.${EXTENSION[file.mimetype]}`);
    await fs.writeFile(fullPath, file.buffer);
    return {
      path: path.relative(process.cwd(), fullPath).split(path.sep).join('/'),
      mime: file.mimetype,
      size: file.size,
    };
  }

  /**
   * Absolute path of a stored file — refuses anything outside the inventory
   * upload root AND anything outside the calling institute's own folder, so
   * one institute can never read another's item images by guessing a path.
   */
  resolve(relativePath: string, instituteId: string): string {
    const absolute = path.resolve(process.cwd(), relativePath);
    const instituteDir = path.resolve(UPLOAD_ROOT, this.instituteFolderHash(instituteId));
    if (!absolute.startsWith(instituteDir + path.sep)) {
      throw new NotFoundException('File not found');
    }
    return absolute;
  }

  /** Best-effort delete (used when a row insert fails, or an image is replaced). */
  async remove(relativePath: string | null | undefined): Promise<void> {
    if (!relativePath) return;
    try {
      await fs.unlink(path.resolve(process.cwd(), relativePath));
    } catch {
      // Already gone — nothing to clean up.
    }
  }
}

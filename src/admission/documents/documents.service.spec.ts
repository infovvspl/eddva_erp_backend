/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { BadRequestException } from '@nestjs/common';
import { DocumentsService } from './documents.service';

const actor = {
  eddva_user_id: 'verifier-1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};

describe('DocumentsService', () => {
  const db = {
    admissionApplicationDocument: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
    },
  };
  const lookup = { application: jest.fn() };
  const audit = { log: jest.fn() };
  const service = new DocumentsService(
    db as never,
    lookup as never,
    audit as never,
  );

  const pendingDoc = {
    document_id: 5,
    application_id: 1,
    document_type: 'birth_certificate',
    verification_status: 'pending',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    lookup.application.mockResolvedValue({
      application_id: 1,
      status: 'under_review',
    });
    db.admissionApplicationDocument.findFirst.mockResolvedValue(pendingDoc);
  });

  describe('verify / reject', () => {
    it('verify records the verifier and timestamp, and audits the decision', async () => {
      db.admissionApplicationDocument.updateMany.mockResolvedValue({
        count: 1,
      });
      db.admissionApplicationDocument.findUniqueOrThrow.mockResolvedValue({
        ...pendingDoc,
        verification_status: 'verified',
      });
      await service.verify(actor, 1, 5);

      expect(db.admissionApplicationDocument.updateMany).toHaveBeenCalledWith({
        where: { document_id: 5, verification_status: 'pending' }, // only a pending document can be decided
        data: expect.objectContaining({
          verification_status: 'verified',
          verified_by: 'verifier-1',
          verified_at: expect.any(Date),
          rejection_reason: null,
        }),
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'verify',
          oldStatus: 'pending',
          newStatus: 'verified',
          metadata: expect.objectContaining({ application_id: 1 }),
        }),
      );
    });

    it('reject stores the reason', async () => {
      db.admissionApplicationDocument.updateMany.mockResolvedValue({
        count: 1,
      });
      db.admissionApplicationDocument.findUniqueOrThrow.mockResolvedValue({});
      await service.reject(actor, 1, 5, { reason: 'Blurred' });
      expect(db.admissionApplicationDocument.updateMany).toHaveBeenCalledWith({
        where: { document_id: 5, verification_status: 'pending' },
        data: expect.objectContaining({
          verification_status: 'rejected',
          rejection_reason: 'Blurred',
        }),
      });
    });

    it('a second reviewer cannot overwrite the first decision (409 with the current status)', async () => {
      db.admissionApplicationDocument.updateMany.mockResolvedValue({
        count: 0,
      });
      db.admissionApplicationDocument.findUniqueOrThrow.mockResolvedValue({
        verification_status: 'rejected',
      });
      await expect(service.verify(actor, 1, 5)).rejects.toMatchObject({
        status: 409,
        response: {
          error: 'DOCUMENT_ALREADY_DECIDED',
          details: { verification_status: 'rejected' },
        },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it.each(['cancelled', 'rejected', 'admitted'])(
      'documents of a %s application are frozen',
      async (status) => {
        lookup.application.mockResolvedValue({ application_id: 1, status });
        await expect(service.verify(actor, 1, 5)).rejects.toMatchObject({
          response: { error: 'APPLICATION_CLOSED' },
        });
        expect(
          db.admissionApplicationDocument.updateMany,
        ).not.toHaveBeenCalled();
      },
    );

    it('a document that does not belong to the application → 404', async () => {
      db.admissionApplicationDocument.findFirst.mockResolvedValue(null);
      await expect(service.verify(actor, 1, 99)).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('upload validation', () => {
    const file = (over: Partial<Express.Multer.File> = {}) =>
      ({
        originalname: 'x.pdf',
        mimetype: 'application/pdf',
        size: 100,
        buffer: Buffer.from('%PDF-1.4 real pdf'),
        ...over,
      }) as Express.Multer.File;

    it('requires a file', async () => {
      await expect(
        service.upload(actor, 1, undefined, { document_type: 'other' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects disallowed types', async () => {
      await expect(
        service.upload(
          actor,
          1,
          file({ mimetype: 'application/x-msdownload' }),
          { document_type: 'other' },
        ),
      ).rejects.toThrow(/not allowed/);
    });

    it('rejects a file whose bytes do not match its declared type', async () => {
      await expect(
        service.upload(
          actor,
          1,
          file({ buffer: Buffer.from('not a pdf at all') }),
          { document_type: 'other' },
        ),
      ).rejects.toThrow(/does not match/);
      expect(db.admissionApplicationDocument.create).not.toHaveBeenCalled();
    });

    it('rejects oversized files', async () => {
      await expect(
        service.upload(actor, 1, file({ size: 11 * 1024 * 1024 }), {
          document_type: 'other',
        }),
      ).rejects.toThrow(/10MB/);
    });

    it('a photo must be an image, not a PDF', async () => {
      await expect(
        service.upload(actor, 1, file(), { document_type: 'photo' }),
      ).rejects.toThrow(/photo must be/);
    });

    it('cannot upload to a closed application', async () => {
      lookup.application.mockResolvedValue({
        application_id: 1,
        status: 'cancelled',
      });
      await expect(
        service.upload(actor, 1, file(), { document_type: 'other' }),
      ).rejects.toMatchObject({
        response: { error: 'APPLICATION_CLOSED' },
      });
    });
  });
});

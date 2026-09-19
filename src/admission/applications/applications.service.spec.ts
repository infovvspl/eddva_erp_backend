/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApplicationsService } from './applications.service';

const actor = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};

describe('ApplicationsService', () => {
  const db = {
    admissionApplication: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    admissionEnquiry: { updateMany: jest.fn() },
    admissionTestRegistration: { count: jest.fn() },
    admissionInterview: { count: jest.fn() },
    $transaction: jest.fn(),
  };
  const lookup = {
    session: jest.fn(),
    program: jest.fn(),
    enquiry: jest.fn(),
    applicant: jest.fn(),
    application: jest.fn(),
  };
  const numbering = { next: jest.fn() };
  const seats = { countHeld: jest.fn() };
  const applicants = { createOrReuse: jest.fn() };
  const access = { assertPermission: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queue: jest.fn() };
  const service = new ApplicationsService(
    db as never,
    lookup as never,
    numbering as never,
    seats as never,
    applicants as never,
    access as never,
    audit as never,
    notifications as never,
  );

  const newApplicant = { name: 'Aarav', phone: '9999999999' };
  const baseDto = { session_id: 1, program_id: 2, applicant: newApplicant };

  beforeEach(() => {
    jest.clearAllMocks();
    access.assertPermission.mockReset().mockResolvedValue(undefined); // clearAllMocks keeps rejections from earlier tests
    db.$transaction.mockImplementation((fn: (t: typeof db) => unknown) =>
      fn(db),
    );
    lookup.session.mockResolvedValue({ session_id: 1, status: 'active' });
    lookup.program.mockResolvedValue({ program_id: 2 });
    applicants.createOrReuse.mockResolvedValue({
      applicant: { applicant_id: 10 },
      reused: false,
    });
    db.admissionApplication.findFirst.mockResolvedValue(null); // no live duplicate
    numbering.next.mockResolvedValue('APP/2027-28/00001');
    db.admissionApplication.create.mockImplementation(
      ({ data }: { data: object }) =>
        Promise.resolve({
          application_id: 100,
          status: 'draft',
          ...data,
          applicant: { applicant_id: 10 },
        }),
    );
    db.admissionEnquiry.updateMany.mockResolvedValue({ count: 1 });
    db.admissionApplication.updateMany.mockResolvedValue({ count: 1 });
  });

  describe('create (Applicant ≠ Application)', () => {
    it('requires exactly one of applicant_id / applicant', async () => {
      await expect(
        service.create(actor, { session_id: 1, program_id: 2 }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(actor, { ...baseDto, applicant_id: 5 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('a direct application (no enquiry) is a draft with a null source_enquiry_id and a system-generated number', async () => {
      const { application } = await service.create(actor, baseDto);
      expect(application.application_number).toBe('APP/2027-28/00001');
      expect(application.source_enquiry_id).toBeNull();
      expect(application.status).toBe('draft');
      expect(db.admissionEnquiry.updateMany).not.toHaveBeenCalled(); // enquiry is optional
      expect(numbering.next).toHaveBeenCalledWith('APPLICATION', db); // number is in the same tx
    });

    it('an existing person is reused, not duplicated', async () => {
      applicants.createOrReuse.mockResolvedValue({
        applicant: { applicant_id: 10 },
        reused: true,
      });
      const result = await service.create(actor, baseDto);
      expect(result.applicant_reused).toBe(true);
    });

    it('a closed session rejects new applications', async () => {
      lookup.session.mockResolvedValue({ session_id: 1, status: 'closed' });
      await expect(service.create(actor, baseDto)).rejects.toMatchObject({
        response: { error: 'SESSION_CLOSED' },
      });
      expect(db.admissionApplication.create).not.toHaveBeenCalled();
    });

    it('one applicant may hold many applications, but not two live ones for the same program+session', async () => {
      db.admissionApplication.findFirst.mockResolvedValue({
        application_id: 7,
        application_number: 'APP/7',
      });
      await expect(service.create(actor, baseDto)).rejects.toMatchObject({
        status: 409,
        response: {
          error: 'DUPLICATE_APPLICATION',
          details: { existing_application_id: 7 },
        },
      });
      expect(db.admissionApplication.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { notIn: ['rejected', 'cancelled'] },
            deleted_at: null,
          }),
        }),
      );
    });

    it('the unique-index race is translated to the same clean 409', async () => {
      db.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '6',
          meta: { target: 'live_applicant_session_program_key' },
        }),
      );
      await expect(service.create(actor, baseDto)).rejects.toMatchObject({
        status: 409,
        response: { error: 'DUPLICATE_APPLICATION' },
      });
    });

    describe('with a source enquiry (conversion)', () => {
      const dto = { ...baseDto, source_enquiry_id: 50 };

      it('links the enquiry and marks it converted in the same transaction', async () => {
        lookup.enquiry.mockResolvedValue({
          enquiry_id: 50,
          status: 'contacted',
        });
        const { application } = await service.create(actor, dto);
        expect(application.source_enquiry_id).toBe(50);
        expect(db.admissionEnquiry.updateMany).toHaveBeenCalledWith({
          where: {
            enquiry_id: 50,
            status: { in: ['new', 'contacted', 'application_started'] },
          },
          data: { status: 'converted' },
        });
      });

      it('an already-converted enquiry cannot be converted twice', async () => {
        lookup.enquiry.mockResolvedValue({
          enquiry_id: 50,
          status: 'converted',
        });
        await expect(service.create(actor, dto)).rejects.toMatchObject({
          status: 409,
          response: { error: 'ENQUIRY_ALREADY_CONVERTED' },
        });
        expect(db.admissionApplication.create).not.toHaveBeenCalled();
      });

      it('a lost enquiry must be reopened first', async () => {
        lookup.enquiry.mockResolvedValue({ enquiry_id: 50, status: 'lost' });
        await expect(service.create(actor, dto)).rejects.toMatchObject({
          response: { error: 'ENQUIRY_LOST' },
        });
      });

      it('a concurrent change to the enquiry aborts the conversion (rollback)', async () => {
        lookup.enquiry.mockResolvedValue({
          enquiry_id: 50,
          status: 'contacted',
        });
        db.admissionEnquiry.updateMany.mockResolvedValue({ count: 0 });
        await expect(service.create(actor, dto)).rejects.toMatchObject({
          status: 409,
          response: { error: 'ENQUIRY_STATUS_CONFLICT' },
        });
      });
    });
  });

  describe('changeStatus — application.status is the single authoritative state', () => {
    const app = (status: string, applicant: object = {}) => ({
      application_id: 1,
      application_number: 'APP/1',
      status,
      applicant: {
        dob: new Date(),
        gender: 'male',
        guardian_name: 'G',
        guardian_contact: '9',
        email: 'a@b.c',
        phone: '9',
        ...applicant,
      },
      session: { status: 'active' },
    });

    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue({} as never);
    });

    it('refuses a jump such as draft → admitted', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('draft'));
      await expect(
        service.changeStatus(actor, 1, { status: 'admitted' }),
      ).rejects.toMatchObject({
        response: { error: 'INVALID_STATUS_TRANSITION' },
      });
      expect(db.admissionApplication.updateMany).not.toHaveBeenCalled();
    });

    it('offered can only be reached through the offer workflow', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('shortlisted'));
      await expect(
        service.changeStatus(actor, 1, { status: 'offered' }),
      ).rejects.toMatchObject({
        response: { error: 'INVALID_STATUS_TRANSITION' },
      });
    });

    it('review decisions need applications:review on top of change_status', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('submitted'));
      access.assertPermission.mockRejectedValue(new ForbiddenException('nope'));
      await expect(
        service.changeStatus(actor, 1, { status: 'under_review' }),
      ).rejects.toThrow(ForbiddenException);
      expect(access.assertPermission).toHaveBeenCalledWith(
        actor,
        'applications',
        'review',
        expect.any(String),
      );
      expect(db.admissionApplication.updateMany).not.toHaveBeenCalled();
    });

    it('non-review moves do not ask for the review permission', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('draft'));
      await service.changeStatus(actor, 1, { status: 'submitted' });
      expect(access.assertPermission).not.toHaveBeenCalled();
    });

    it.each(['rejected', 'cancelled'] as const)(
      '%s requires a reason',
      async (status) => {
        db.admissionApplication.findFirst.mockResolvedValue(
          app('under_review'),
        );
        await expect(
          service.changeStatus(actor, 1, { status }),
        ).rejects.toThrow(BadRequestException);
      },
    );

    it('submitting needs a complete applicant profile', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(
        app('draft', { dob: null, guardian_name: null }),
      );
      await expect(
        service.changeStatus(actor, 1, { status: 'submitted' }),
      ).rejects.toMatchObject({
        response: {
          error: 'APPLICANT_PROFILE_INCOMPLETE',
          details: { missing: ['dob', 'guardian_name'] },
        },
      });
    });

    it('applies the move guarded by the current status, then audits with reason and attribution', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('under_review'));
      await service.changeStatus(actor, 1, {
        status: 'rejected',
        reason: 'Below cut-off',
      });
      expect(db.admissionApplication.updateMany).toHaveBeenCalledWith({
        where: { application_id: 1, status: { in: ['under_review'] } },
        data: { status: 'rejected' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          action: 'status_change',
          oldStatus: 'under_review',
          newStatus: 'rejected',
          reason: 'Below cut-off',
          metadata: { application_id: 1 },
        }),
      );
      expect(notifications.queue).toHaveBeenCalled();
    });

    it('a concurrent status change is a 409, not a lost update', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(app('draft'));
      db.admissionApplication.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.changeStatus(actor, 1, { status: 'submitted' }),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: 'APPLICATION_STATUS_CONFLICT' },
      });
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('unknown application → 404', async () => {
      db.admissionApplication.findFirst.mockResolvedValue(null);
      await expect(
        service.changeStatus(actor, 1, { status: 'submitted' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('update / remove', () => {
    it('cannot be edited once it has progressed past review', async () => {
      lookup.application.mockResolvedValue({
        application_id: 1,
        status: 'shortlisted',
        session_id: 1,
        program_id: 2,
      });
      await expect(
        service.update(actor, 1, { program_id: 3 }),
      ).rejects.toMatchObject({
        response: { error: 'APPLICATION_NOT_EDITABLE' },
      });
    });

    it('program/session cannot change after a test or interview is attached', async () => {
      lookup.application.mockResolvedValue({
        application_id: 1,
        status: 'submitted',
        session_id: 1,
        program_id: 2,
      });
      db.admissionTestRegistration.count.mockResolvedValue(1);
      db.admissionInterview.count.mockResolvedValue(0);
      await expect(
        service.update(actor, 1, { program_id: 3 }),
      ).rejects.toMatchObject({
        response: { error: 'APPLICATION_HAS_ASSESSMENTS' },
      });
    });

    it('only draft/rejected/cancelled applications can be (soft) deleted', async () => {
      lookup.application.mockResolvedValue({
        application_id: 1,
        status: 'admitted',
      });
      await expect(service.remove(actor, 1)).rejects.toThrow(ConflictException);

      lookup.application.mockResolvedValue({
        application_id: 1,
        status: 'draft',
      });
      db.admissionApplication.update.mockResolvedValue({});
      await service.remove(actor, 1);
      expect(db.admissionApplication.update).toHaveBeenCalledWith({
        where: { application_id: 1 },
        data: { deleted_at: expect.any(Date) }, // soft delete — never a hard delete
      });
    });
  });
});

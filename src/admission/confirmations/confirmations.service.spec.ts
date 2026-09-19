import { Prisma } from '@prisma/client';
import { ConfirmationsService } from './confirmations.service';

const actor = {
  eddva_user_id: 'u1',
  institute_id: 'inst-1',
  user_name: 'Riya',
  user_role: 'Officer',
  is_institute_admin: false,
};

const application = {
  application_id: 1,
  program_id: 5,
  session_id: 2,
  status: 'offered',
};
const D = (n: number) => new Prisma.Decimal(n);

describe('ConfirmationsService.confirm — the applicant→student boundary', () => {
  const tx = {
    admissionConfirmation: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    admissionOffer: { findUnique: jest.fn() },
    admissionApplication: { updateMany: jest.fn() },
    admissionFeeStructure: { findUnique: jest.fn() },
    admissionPayment: { aggregate: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const lookup = { lockApplication: jest.fn(), application: jest.fn() };
  const numbering = { next: jest.fn() };
  const audit = { log: jest.fn() };
  const notifications = { queue: jest.fn() };
  const service = new ConfirmationsService(
    prisma as never,
    lookup as never,
    numbering as never,
    audit as never,
    notifications as never,
  );

  const feePosition = (required: number, paid: number) => {
    tx.admissionFeeStructure.findUnique.mockResolvedValue({
      amount: D(required),
      due_date: new Date(),
    });
    tx.admissionPayment.aggregate.mockResolvedValue({
      _sum: { amount_paid: D(paid) },
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    lookup.lockApplication.mockResolvedValue({ ...application });
    tx.admissionConfirmation.findUnique.mockResolvedValue(null);
    tx.admissionOffer.findUnique.mockResolvedValue({ status: 'accepted' });
    tx.admissionApplication.updateMany.mockResolvedValue({ count: 1 });
    numbering.next.mockResolvedValue('ENR/2027-28/00001');
    tx.admissionConfirmation.create.mockResolvedValue({
      confirmation_id: 9,
      application_id: 1,
      enrollment_number: 'ENR/2027-28/00001',
      status: 'confirmed',
      confirmed_date: new Date(),
      student_ref: null,
      student_link_status: 'pending',
      application: { applicant: { email: 'a@b.c', phone: '9999999999' } },
    });
    feePosition(25000, 25000);
  });

  const rejectsWith = (code: string, status?: number) =>
    expect(service.confirm(actor, 1)).rejects.toMatchObject({
      ...(status ? { status } : {}),
      response: { error: code },
    });

  const nothingWasWritten = () => {
    expect(numbering.next).not.toHaveBeenCalled(); // no enrollment number burned
    expect(tx.admissionConfirmation.create).not.toHaveBeenCalled();
    expect(tx.admissionApplication.updateMany).not.toHaveBeenCalled();
  };

  it('offer not accepted → rejected, nothing written', async () => {
    tx.admissionOffer.findUnique.mockResolvedValue({ status: 'offered' });
    await rejectsWith('OFFER_NOT_ACCEPTED');
    nothingWasWritten();
  });

  it('no offer at all → rejected', async () => {
    tx.admissionOffer.findUnique.mockResolvedValue(null);
    await rejectsWith('OFFER_NOT_ACCEPTED');
    nothingWasWritten();
  });

  it('expired offer → OFFER_EXPIRED', async () => {
    tx.admissionOffer.findUnique.mockResolvedValue({ status: 'expired' });
    await rejectsWith('OFFER_EXPIRED');
    nothingWasWritten();
  });

  it('accepted offer but fee not paid → ADMISSION_FEE_NOT_PAID with the balance', async () => {
    feePosition(25000, 0);
    await expect(service.confirm(actor, 1)).rejects.toMatchObject({
      response: {
        error: 'ADMISSION_FEE_NOT_PAID',
        message:
          'Admission cannot be confirmed until the admission fee is paid.',
        details: { required: '25000', paid: '0', balance: '25000' },
      },
    });
    nothingWasWritten();
  });

  it('partial payment is not enough', async () => {
    feePosition(25000, 24999.99);
    await rejectsWith('ADMISSION_FEE_NOT_PAID');
    nothingWasWritten();
  });

  it('no fee structure configured → cannot decide, so refuses', async () => {
    tx.admissionFeeStructure.findUnique.mockResolvedValue(null);
    tx.admissionPayment.aggregate.mockResolvedValue({
      _sum: { amount_paid: null },
    });
    await rejectsWith('ADMISSION_FEE_NOT_CONFIGURED');
    nothingWasWritten();
  });

  it('a configured fee of 0 needs no payment', async () => {
    feePosition(0, 0);
    await expect(service.confirm(actor, 1)).resolves.toBeDefined();
  });

  it('application not in "offered" status → refused', async () => {
    lookup.lockApplication.mockResolvedValue({
      ...application,
      status: 'shortlisted',
    });
    await rejectsWith('APPLICATION_NOT_OFFERED', 422);
    nothingWasWritten();
  });

  it('already confirmed → 409 ADMISSION_ALREADY_CONFIRMED, exposing the existing enrollment number', async () => {
    tx.admissionConfirmation.findUnique.mockResolvedValue({
      status: 'confirmed',
      enrollment_number: 'ENR/2027-28/00007',
      confirmed_date: new Date(),
    });
    await expect(service.confirm(actor, 1)).rejects.toMatchObject({
      status: 409,
      response: {
        error: 'ADMISSION_ALREADY_CONFIRMED',
        message: 'This application has already been confirmed.',
        details: { enrollment_number: 'ENR/2027-28/00007' },
      },
    });
    nothingWasWritten();
  });

  it('a cancelled confirmation cannot be silently re-confirmed', async () => {
    tx.admissionConfirmation.findUnique.mockResolvedValue({
      status: 'cancelled',
      enrollment_number: 'ENR/1',
      confirmed_date: new Date(),
    });
    await rejectsWith('CONFIRMATION_CANCELLED', 409);
  });

  it('offer accepted + fee paid → confirms atomically: number, row, status offered→admitted', async () => {
    const result = await service.confirm(actor, 1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(lookup.lockApplication).toHaveBeenCalledWith('inst-1', 1, tx); // row lock, inside the tx
    expect(numbering.next).toHaveBeenCalledWith(
      'ENROLLMENT',
      tx,
      expect.any(Date),
    ); // number rolls back with the tx
    expect(tx.admissionApplication.updateMany).toHaveBeenCalledWith({
      where: { application_id: 1, status: { in: ['offered'] } },
      data: { status: 'admitted' },
    });
    expect(result.enrollment_number).toBe('ENR/2027-28/00001');
    expect(result.status).toBe('confirmed');
    expect(audit.log).toHaveBeenCalledWith(
      actor,
      expect.objectContaining({
        action: 'confirm',
        entityType: 'admission_confirmation',
      }),
    );
  });

  it('does not fake a Student: the link stays pending with no reference', async () => {
    const result = await service.confirm(actor, 1);
    expect(result.student).toEqual(
      expect.objectContaining({ status: 'pending', student_ref: null }),
    );
  });

  it('a lost status race aborts the whole confirmation (409)', async () => {
    tx.admissionApplication.updateMany.mockResolvedValue({ count: 0 });
    await rejectsWith('APPLICATION_STATUS_CONFLICT', 409);
  });

  it('does not record audit/notification when the transaction failed', async () => {
    tx.admissionOffer.findUnique.mockResolvedValue({ status: 'offered' });
    await service.confirm(actor, 1).catch(() => undefined);
    expect(audit.log).not.toHaveBeenCalled();
    expect(notifications.queue).not.toHaveBeenCalled();
  });
});

describe('ConfirmationsService.cancel / linkStudent', () => {
  const tx = {
    admissionConfirmation: {
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    admissionApplication: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    admissionConfirmation: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };
  const lookup = {
    lockApplication: jest.fn().mockResolvedValue({ application_id: 1 }),
  };
  const audit = { log: jest.fn() };
  const service = new ConfirmationsService(
    prisma as never,
    lookup as never,
    {} as never,
    audit as never,
    {} as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('cannot cancel once a Student record has been linked', async () => {
    tx.admissionConfirmation.findUnique.mockResolvedValue({
      confirmation_id: 9,
      status: 'confirmed',
      student_link_status: 'linked',
      student_ref: 'STU-1',
    });
    await expect(
      service.cancel(actor, 1, { reason: 'x' }),
    ).rejects.toMatchObject({
      response: { error: 'STUDENT_ALREADY_CREATED' },
    });
    expect(tx.admissionApplication.updateMany).not.toHaveBeenCalled();
  });

  it('cancelling twice is a 409', async () => {
    tx.admissionConfirmation.findUnique.mockResolvedValue({
      confirmation_id: 9,
      status: 'cancelled',
      student_link_status: 'pending',
    });
    await expect(
      service.cancel(actor, 1, { reason: 'x' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'CONFIRMATION_ALREADY_CANCELLED' },
    });
  });

  it('cancel moves the application admitted→cancelled (releasing the seat)', async () => {
    tx.admissionConfirmation.findUnique.mockResolvedValue({
      confirmation_id: 9,
      status: 'confirmed',
      student_link_status: 'pending',
    });
    tx.admissionConfirmation.updateMany.mockResolvedValue({ count: 1 });
    tx.admissionApplication.updateMany.mockResolvedValue({ count: 1 });
    tx.admissionConfirmation.findUniqueOrThrow.mockResolvedValue({
      confirmation_id: 9,
      enrollment_number: 'ENR/1',
      status: 'cancelled',
      student_ref: null,
      student_link_status: 'pending',
    });
    await service.cancel(actor, 1, { reason: 'Withdrew' });
    expect(tx.admissionApplication.updateMany).toHaveBeenCalledWith({
      where: { application_id: 1, status: { in: ['admitted'] } },
      data: { status: 'cancelled' },
    });
  });

  it('link-student only works for a confirmed admission still awaiting its Student', async () => {
    prisma.admissionConfirmation.findFirst.mockResolvedValue({
      confirmation_id: 9,
      application_id: 1,
      status: 'confirmed',
      student_link_status: 'linked',
    });
    prisma.admissionConfirmation.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.linkStudent(actor, 9, { student_ref: 'STU-2' }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: 'STUDENT_LINK_NOT_ALLOWED' },
    });
    expect(prisma.admissionConfirmation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          confirmation_id: 9,
          status: 'confirmed',
          student_link_status: 'pending',
        },
      }),
    );
  });
});

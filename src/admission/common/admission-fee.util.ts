import { Prisma } from '@prisma/client';

export interface AdmissionFeeSummary {
  /** null when no fee structure is configured for the application's program + session */
  required: Prisma.Decimal | null;
  paid: Prisma.Decimal;
  balance: Prisma.Decimal | null;
  due_date: Date | null;
  fee_structure_configured: boolean;
  /** true only when a structure exists and payments cover it (a configured amount of 0 is trivially paid) */
  is_paid: boolean;
}

/**
 * The admission fee position of one application. Pass the active transaction
 * client when calling from inside a transaction so the numbers are consistent
 * with the locks the caller holds.
 */
export async function computeFeeSummary(
  db: Prisma.TransactionClient,
  application: {
    application_id: number;
    program_id: number;
    session_id: number;
  },
): Promise<AdmissionFeeSummary> {
  const [structure, paidAgg] = await Promise.all([
    db.admissionFeeStructure.findUnique({
      where: {
        program_id_session_id: {
          program_id: application.program_id,
          session_id: application.session_id,
        },
      },
    }),
    db.admissionPayment.aggregate({
      where: { application_id: application.application_id },
      _sum: { amount_paid: true },
    }),
  ]);

  const paid = paidAgg._sum.amount_paid ?? new Prisma.Decimal(0);
  if (!structure) {
    return {
      required: null,
      paid,
      balance: null,
      due_date: null,
      fee_structure_configured: false,
      is_paid: false,
    };
  }

  const balance = structure.amount.sub(paid);
  return {
    required: structure.amount,
    paid,
    balance: balance.isNeg() ? new Prisma.Decimal(0) : balance,
    due_date: structure.due_date,
    fee_structure_configured: true,
    is_paid: paid.gte(structure.amount),
  };
}

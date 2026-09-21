/** Escapes text for safe inclusion in the receipt HTML (donor names, references are user-supplied). */
export function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ReceiptData {
  receipt_number: string;
  issued_at: Date | string | null;
  status: 'valid' | 'void';
  void_reason: string | null;
  institute_id: string;
  donor: {
    name: string;
    batch_year: number;
    program: string | null;
    email: string;
  };
  donation: {
    amount: string;
    campaign: string;
    donation_date: Date | string;
    payment_mode: string;
    transaction_ref: string | null;
  };
}

const fmt = (d: Date | string | null) =>
  d ? new Date(d).toISOString().slice(0, 10) : '';

/**
 * Self-contained HTML for the donation receipt. It is handed to the shared
 * PdfService (Puppeteer) to become a PDF, so donor-controlled text is escaped.
 */
export function renderReceiptHtml(r: ReceiptData): string {
  const row = (label: string, value: string) =>
    `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Donation receipt ${escapeHtml(r.receipt_number)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; margin: 0; padding: 24px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #ddd; font-size: 14px; }
  th { width: 34%; color: #444; font-weight: 600; }
  .amount { font-size: 20px; font-weight: 700; }
  .void { color: #b00020; font-weight: 700; border: 2px solid #b00020; display: inline-block; padding: 4px 10px; margin-bottom: 12px; }
  .foot { margin-top: 28px; font-size: 12px; color: #666; }
</style></head><body>
  <h1>Donation Receipt</h1>
  <div class="sub">Receipt No. ${escapeHtml(r.receipt_number)} &middot; Issued ${escapeHtml(fmt(r.issued_at))}</div>
  ${r.status === 'void' ? `<div class="void">VOID${r.void_reason ? ` &mdash; ${escapeHtml(r.void_reason)}` : ''}</div>` : ''}
  <table>
    ${row('Received from', r.donor.name)}
    ${row('Batch / Program', `${r.donor.batch_year}${r.donor.program ? ` / ${r.donor.program}` : ''}`)}
    ${row('Email', r.donor.email)}
    ${row('Towards', r.donation.campaign)}
    <tr><th>Amount</th><td class="amount">${escapeHtml(r.donation.amount)}</td></tr>
    ${row('Date received', fmt(r.donation.donation_date))}
    ${row('Payment mode', r.donation.payment_mode.replace('_', ' '))}
    ${row('Transaction reference', r.donation.transaction_ref ?? '')}
  </table>
  <div class="foot">Thank you for supporting your alma mater. This receipt is computer generated.</div>
</body></html>`;
}

import { resolvePaymentStatus } from './payment-status.util';

describe('resolvePaymentStatus', () => {
  it('is UNPAID when nothing has been paid', () => {
    expect(resolvePaymentStatus(0, 1000)).toBe('UNPAID');
  });

  it('is PARTIALLY_PAID when paid is between zero and the grand total', () => {
    expect(resolvePaymentStatus(400, 1000)).toBe('PARTIALLY_PAID');
  });

  it('is PAID when paid equals the grand total', () => {
    expect(resolvePaymentStatus(1000, 1000)).toBe('PAID');
  });

  it('is PAID when paid exceeds the grand total (defensive — should not normally occur)', () => {
    expect(resolvePaymentStatus(1200, 1000)).toBe('PAID');
  });
});

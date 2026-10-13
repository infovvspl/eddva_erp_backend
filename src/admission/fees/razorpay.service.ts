import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createHmac } from 'crypto';
import Razorpay from 'razorpay';

/**
 * Thin wrapper around the Razorpay SDK, test-mode credentials only
 * (RAZORPAY_KEY_ID/SECRET). Mirrors the exact order-create + HMAC
 * signature-verify pattern already used for coaching batch checkout
 * elsewhere in this codebase — same two steps, same signature formula.
 */
@Injectable()
export class RazorpayService {
  private instance(): Razorpay {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_id || !key_secret) {
      throw new InternalServerErrorException('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
    }
    return new Razorpay({ key_id, key_secret });
  }

  /** Creates a Razorpay order for `amountRupees` (converted to paise) and returns what the frontend's Checkout needs. */
  async createOrder(amountRupees: number, receipt: string): Promise<{ orderId: string; amount: number; currency: string; key: string }> {
    const rzp = this.instance();
    const order = await rzp.orders.create({
      amount: Math.round(amountRupees * 100),
      currency: 'INR',
      receipt,
    });
    return {
      orderId: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID!,
    };
  }

  /** Verifies the Checkout success payload's HMAC signature. Throws if it doesn't match. */
  verifySignature(orderId: string, paymentId: string, signature: string): void {
    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) throw new InternalServerErrorException('Razorpay is not configured (RAZORPAY_KEY_SECRET missing)');

    const expected = createHmac('sha256', key_secret).update(`${orderId}|${paymentId}`).digest('hex');
    if (expected !== signature) {
      throw new BadRequestException('Invalid payment signature');
    }
  }

  /** Fetches the order from Razorpay directly — never trust a client-supplied amount. */
  async fetchOrderAmount(orderId: string): Promise<number> {
    const rzp = this.instance();
    const order = await rzp.orders.fetch(orderId);
    return Number(order.amount) / 100;
  }
}

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/** Server-to-server calls from eddva_platform, authenticated with the shared INTERNAL_API_KEY. */
@Injectable()
export class InternalKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_API_KEY;
    const provided = context.switchToHttp().getRequest().headers['x-internal-key'];
    // Fails closed: with no key configured nothing can authenticate.
    if (!expected || typeof provided !== 'string') throw new UnauthorizedException('Invalid internal key');
    // Hashing first makes the comparison constant-length as well as constant-time.
    if (!timingSafeEqual(digest(expected), digest(provided))) throw new UnauthorizedException('Invalid internal key');
    return true;
  }
}

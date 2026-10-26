import { ConflictException, ExecutionContext, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InternalKeyGuard } from './internal-key.guard';
import { PlatformLinkController } from './platform-link.controller';

describe('InternalKeyGuard', () => {
  const ctx = (headers: Record<string, unknown>) =>
    ({ switchToHttp: () => ({ getRequest: () => ({ headers }) }) }) as unknown as ExecutionContext;
  const saved = process.env.INTERNAL_API_KEY;
  afterEach(() => (saved === undefined ? delete process.env.INTERNAL_API_KEY : (process.env.INTERNAL_API_KEY = saved)));

  it('allows the right key', () => {
    process.env.INTERNAL_API_KEY = 'secret-key';
    expect(new InternalKeyGuard().canActivate(ctx({ 'x-internal-key': 'secret-key' }))).toBe(true);
  });

  it.each([['wrong', 'a different key'], [undefined, 'no header'], ['', 'an empty key']])(
    'rejects %p (%s)',
    (provided, _description) => {
      process.env.INTERNAL_API_KEY = 'secret-key';
      expect(() => new InternalKeyGuard().canActivate(ctx({ 'x-internal-key': provided }))).toThrow(UnauthorizedException);
    },
  );

  it('fails closed when no key is configured, even for an empty header', () => {
    delete process.env.INTERNAL_API_KEY;
    expect(() => new InternalKeyGuard().canActivate(ctx({ 'x-internal-key': '' }))).toThrow(UnauthorizedException);
    expect(() => new InternalKeyGuard().canActivate(ctx({}))).toThrow(UnauthorizedException);
  });
});

describe('PlatformLinkController', () => {
  const prisma = { user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
  const controller = new PlatformLinkController(prisma as any);
  const dto = { instituteId: 'inst-1', email: 'Head@School.test', platformUserId: 'p-1' };
  beforeEach(() => jest.clearAllMocks());

  it('links an unlinked user, matching the email case-insensitively inside the institute', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', platformUserId: null });
    prisma.user.findUnique.mockResolvedValue(null);
    await expect(controller.link(dto)).resolves.toEqual({ userId: 'u1', linked: true });
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { instituteId: 'inst-1', email: { equals: 'Head@School.test', mode: 'insensitive' } },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { platformUserId: 'p-1' } });
  });

  it('is idempotent for the same link', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', platformUserId: 'p-1' });
    await expect(controller.link(dto)).resolves.toEqual({ userId: 'u1', linked: true });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('404s when the ERP user does not exist', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(controller.link(dto)).rejects.toThrow(NotFoundException);
  });

  it('refuses to re-point an existing link', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', platformUserId: 'someone-else' });
    await expect(controller.link(dto)).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('refuses to link a platform user that is already linked elsewhere', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'u1', platformUserId: null });
    prisma.user.findUnique.mockResolvedValue({ id: 'u2' });
    await expect(controller.link(dto)).rejects.toThrow(ConflictException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  INSTITUTE_ADMIN_ROLE,
  PlatformInstitutesController,
  UpsertPlatformInstituteDto,
} from './platform-institutes.controller';

const INSTITUTE = 'inst-1';
const admin = { name: 'Head', email: 'Head@School.test', passwordHash: '$2a$12$abcdefghijklmnopqrstuv', platformUserId: 'p-1' };

function setup(over: Record<string, any> = {}) {
  const tx: any = {
    role: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'role-1' }) },
    rolePermission: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({}) },
    permission: { findMany: jest.fn().mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]) },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
      update: jest.fn().mockResolvedValue({}),
    },
    ...over,
  };
  const prisma: any = { $transaction: jest.fn(async (fn: any) => fn(tx)) };
  return { ctl: new PlatformInstitutesController(prisma), tx };
}

describe('PlatformInstitutesController', () => {
  it('creates the admin role with every permission and a first admin carrying the platform link', async () => {
    const { ctl, tx } = setup();
    const res = await ctl.upsert(INSTITUTE, { status: 'active', admin });

    expect(res).toEqual({ instituteId: INSTITUTE, roleId: 'role-1', adminUserId: 'user-1', permissionsGranted: 2 });
    expect(tx.role.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ roleName: INSTITUTE_ADMIN_ROLE, instituteId: INSTITUTE }),
    });
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: 'role-1', permissionId: 'perm-1' }, { roleId: 'role-1', permissionId: 'perm-2' }],
      skipDuplicates: true,
    });
    expect(tx.user.create).toHaveBeenCalledWith({
      data: { instituteId: INSTITUTE, name: 'Head', email: admin.email, passwordHash: admin.passwordHash, roleId: 'role-1', platformUserId: 'p-1' },
    });
  });

  it('is idempotent: reuses the role, grants only missing permissions and leaves a linked admin alone', async () => {
    const { ctl, tx } = setup({
      role: { findFirst: jest.fn().mockResolvedValue({ id: 'role-1' }), create: jest.fn() },
      rolePermission: { findMany: jest.fn().mockResolvedValue([{ permissionId: 'perm-1' }]), createMany: jest.fn() },
    });
    tx.user.findUnique.mockResolvedValue({ id: 'user-1' });

    const res = await ctl.upsert(INSTITUTE, { status: 'active', admin });
    expect(res).toMatchObject({ roleId: 'role-1', adminUserId: 'user-1', permissionsGranted: 1 });
    expect(tx.role.create).not.toHaveBeenCalled();
    expect(tx.rolePermission.createMany).toHaveBeenCalledWith({ data: [{ roleId: 'role-1', permissionId: 'perm-2' }], skipDuplicates: true });
    expect(tx.user.create).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled(); // no password or other change to an existing admin
  });

  it('syncs the role without an admin, creating no user', async () => {
    const { ctl, tx } = setup();
    await expect(ctl.upsert(INSTITUTE, { status: 'active' })).resolves.toMatchObject({ adminUserId: null });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('links an existing same-institute user matched by email (case-insensitive)', async () => {
    const { ctl, tx } = setup();
    tx.user.findFirst.mockResolvedValue({ id: 'u9', instituteId: INSTITUTE, platformUserId: null });
    await expect(ctl.upsert(INSTITUTE, { status: 'active', admin })).resolves.toMatchObject({ adminUserId: 'u9' });
    expect(tx.user.findFirst).toHaveBeenCalledWith({ where: { email: { equals: admin.email, mode: 'insensitive' } } });
    expect(tx.user.update).toHaveBeenCalledWith({ where: { id: 'u9' }, data: { platformUserId: 'p-1' } });
    expect(tx.user.create).not.toHaveBeenCalled();
  });

  it('refuses an email owned by another institute or already linked to someone else', async () => {
    const a = setup();
    a.tx.user.findFirst.mockResolvedValue({ id: 'u9', instituteId: 'other', platformUserId: null });
    await expect(a.ctl.upsert(INSTITUTE, { status: 'active', admin })).rejects.toThrow(ConflictException);

    const b = setup();
    b.tx.user.findFirst.mockResolvedValue({ id: 'u9', instituteId: INSTITUTE, platformUserId: 'someone-else' });
    await expect(b.ctl.upsert(INSTITUTE, { status: 'active', admin })).rejects.toThrow(ConflictException);
  });

  it('maps a unique-constraint race to a 409 and rethrows anything else', async () => {
    const { ctl, tx } = setup();
    tx.user.create.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }));
    await expect(ctl.upsert(INSTITUTE, { status: 'active', admin })).rejects.toThrow(ConflictException);

    const other = setup();
    other.tx.user.create.mockRejectedValue(new Error('db down'));
    await expect(other.ctl.upsert(INSTITUTE, { status: 'active', admin })).rejects.toThrow('db down');
  });
});

describe('UpsertPlatformInstituteDto validation', () => {
  const errors = async (body: object) => (await validate(plainToInstance(UpsertPlatformInstituteDto, body))).length;

  it('accepts a payload with or without an admin', async () => {
    expect(await errors({ status: 'active', admin })).toBe(0);
    expect(await errors({ status: 'suspended' })).toBe(0);
  });

  it.each([
    ['an unknown status', { status: 'deleted' }],
    ['a plaintext password', { status: 'active', admin: { ...admin, passwordHash: 'plain' } }],
    ['a bad email', { status: 'active', admin: { ...admin, email: 'nope' } }],
    ['no platform user id', { status: 'active', admin: { ...admin, platformUserId: '' } }],
  ])('rejects %s', async (_n, body) => {
    expect(await errors(body)).toBeGreaterThan(0);
  });
});

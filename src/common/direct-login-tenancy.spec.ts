import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountsAuthService } from '../accounts/auth/accounts-auth.service';
import { FrontOfficeAuthService } from '../front-office/auth/front-office-auth.service';
import { InventoryAuthService } from '../inventory/auth/inventory-auth.service';
import { SportsAuthService } from '../sports/auth/sports-auth.service';
import { TransportAuthService } from '../transport/auth/transport-auth.service';
import { CanteenAuthService } from '../canteen/auth/canteen-auth.service';
import { LibAuthService } from '../library/auth/lib-auth.service';
import { SalesPurchaseAuthService } from '../sales-purchase/auth/sales-purchase-auth.service';

// The same username can exist in two institutes (the unique key is institute + username),
// so a login must never silently pick one of them.
const cases: Array<[string, new (prisma: any) => { directLogin: (u: string, p: string, i?: string) => Promise<any> }, string]> = [
  ['accounts', AccountsAuthService as any, 'ACCOUNTS_JWT_SECRET'],
  ['front-office', FrontOfficeAuthService as any, 'FRONT_OFFICE_JWT_SECRET'],
  ['inventory', InventoryAuthService as any, 'INVENTORY_JWT_SECRET'],
  ['sports', SportsAuthService as any, 'SPORTS_JWT_SECRET'],
  ['transport', TransportAuthService as any, 'TRANSPORT_JWT_SECRET'],
  ['canteen', CanteenAuthService as any, 'CANTEEN_JWT_SECRET'],
  ['library', LibAuthService as any, 'LIBRARY_JWT_SECRET'],
  ['sales-purchase', SalesPurchaseAuthService as any, 'SALES_PURCHASE_JWT_SECRET'],
];

function prismaReturning(rows: any[]) {
  const findMany = jest.fn().mockResolvedValue(rows);
  const prisma: any = new Proxy({}, { get: () => ({ findMany }) });
  return { prisma, findMany };
}

describe.each(cases)('%s directLogin', (_name, Service, secretEnv) => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.JWT_SECRET = 'core-secret';
    process.env.SCHOOL_JWT_SECRET = 'school-secret';
    process.env[secretEnv] = `module-secret-for-${_name}`;
  });
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses to guess when the username exists in more than one institute', async () => {
    const { prisma, findMany } = prismaReturning([{ institute_id: 'a' }, { institute_id: 'b' }]);
    await expect(new Service(prisma).directLogin('anita', 'pw')).rejects.toThrow(BadRequestException);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
  });

  it('narrows the lookup to one institute when the caller names it', async () => {
    const { prisma, findMany } = prismaReturning([]);
    await expect(new Service(prisma).directLogin('anita', 'pw', 'inst-b')).rejects.toThrow(UnauthorizedException);
    expect(findMany.mock.calls[0][0].where.institute_id).toBe('inst-b');
  });

  it('does not add an institute filter when none is given', async () => {
    const { prisma, findMany } = prismaReturning([]);
    await expect(new Service(prisma).directLogin('anita', 'pw')).rejects.toThrow(UnauthorizedException);
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty('institute_id');
  });

  it('rejects a wrong password for the single match', async () => {
    const password_hash = await bcrypt.hash('right', 4);
    const { prisma } = prismaReturning([
      { institute_id: 'a', eddva_user_id: 'u1', user_name: 'Anita', user_email: null, password_hash, role_id: 1, role: { name: 'Librarian', permissions: [] } },
    ]);
    await expect(new Service(prisma).directLogin('anita', 'wrong')).rejects.toThrow(UnauthorizedException);
  });

  it('signs a session for the single matching institute on the right password', async () => {
    const password_hash = await bcrypt.hash('right', 4);
    const { prisma } = prismaReturning([
      { institute_id: 'a', eddva_user_id: 'u1', user_name: 'Anita', user_email: null, password_hash, role_id: 1, role: { name: 'Librarian', permissions: [] } },
    ]);
    const result = await new Service(prisma).directLogin('anita', 'right');
    expect(result.user.institute_id).toBe('a');
    expect(Object.keys(result).some((k) => k.endsWith('_token'))).toBe(true);
  });
});

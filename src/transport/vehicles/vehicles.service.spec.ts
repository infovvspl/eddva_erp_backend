import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TransportAuditService } from '../common/transport-audit.service';

describe('VehiclesService', () => {
  let service: VehiclesService;

  const mockPrisma = {
    transportVehicle: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const mockAudit = { log: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VehiclesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: TransportAuditService, useValue: mockAudit },
      ],
    }).compile();
    service = module.get(VehiclesService);
  });

  it('rejects creating a duplicate registration number within the same institute', async () => {
    mockPrisma.transportVehicle.findUnique.mockResolvedValue({ vehicle_id: 1, registration_number: 'DL1P 1234' });

    await expect(service.create('INST_1', { registration_number: 'DL1P 1234' } as any)).rejects.toThrow(ConflictException);
    expect(mockPrisma.transportVehicle.create).not.toHaveBeenCalled();
  });

  it('scopes findOne by institute_id so a vehicle from another institute 404s', async () => {
    mockPrisma.transportVehicle.findFirst.mockResolvedValue(null);
    await expect(service.findOne('INST_1', 1)).rejects.toThrow(NotFoundException);
    expect(mockPrisma.transportVehicle.findFirst).toHaveBeenCalledWith({ where: { vehicle_id: 1, institute_id: 'INST_1' } });
  });

  it('converts a foreign-key violation on delete into a friendly Conflict instead of a raw Prisma error', async () => {
    mockPrisma.transportVehicle.findFirst.mockResolvedValue({ vehicle_id: 1 });
    mockPrisma.transportVehicle.delete.mockRejectedValue({ code: 'P2003' });

    await expect(service.remove('INST_1', 1)).rejects.toThrow(ConflictException);
  });
});

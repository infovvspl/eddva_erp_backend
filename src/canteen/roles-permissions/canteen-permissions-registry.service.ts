import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCanteenCustomPermissionDto,
  UpdateCanteenCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { CANTEEN_RESOURCE_CATALOG } from './dto/create-dynamic-role.dto';
import { CanteenPlatformUser } from '../auth/canteen-auth.service';
import { isCanteenAdmin } from '../common/canteen-access.service';

@Injectable()
export class CanteenPermissionsRegistryService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedDefaultPermissions();
    } catch (err) {
      console.error('Failed to seed default Canteen permissions:', err);
    }
  }

  /**
   * Auto-seeds system default permissions into the
   * canteen_permissions_catalog table in one idempotent
   * createMany({ skipDuplicates: true }) — the unique `key` constraint makes
   * Postgres skip rows that already exist.
   */
  async seedDefaultPermissions() {
    const data = CANTEEN_RESOURCE_CATALOG.flatMap((item) =>
      item.available_actions.map((action) => ({
        key: `${item.resource}:${action}`,
        resource: item.resource,
        action,
        name: `${action.toUpperCase()} ${item.name}`,
        category: item.name,
        description: item.description,
        is_system: true,
        is_active: true,
      })),
    );
    await this.prisma.canteenPermission.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async listPermissions() {
    const list = await this.prisma.canteenPermission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const resourcesMap = new Map<
      string,
      {
        resource: string;
        name: string;
        available_actions: string[];
        permissions: any[];
      }
    >();

    for (const perm of list) {
      if (!resourcesMap.has(perm.resource)) {
        resourcesMap.set(perm.resource, {
          resource: perm.resource,
          name: perm.category,
          available_actions: [],
          permissions: [],
        });
      }
      const entry = resourcesMap.get(perm.resource)!;
      if (!entry.available_actions.includes(perm.action)) {
        entry.available_actions.push(perm.action);
      }
      entry.permissions.push(perm);
    }

    return {
      total: list.length,
      resources: Array.from(resourcesMap.values()),
      all_permissions: list,
    };
  }

  async getPermission(id: number) {
    const perm = await this.prisma.canteenPermission.findUnique({
      where: { permission_id: id },
    });
    if (!perm) throw new NotFoundException(`Permission #${id} not found`);
    return perm;
  }

  async createPermission(
    actor: CanteenPlatformUser,
    dto: CreateCanteenCustomPermissionDto,
  ) {
    this.requireInstituteAdmin(actor);
    const key = `${dto.resource.trim().toLowerCase()}:${dto.action.trim().toLowerCase()}`;
    const existing = await this.prisma.canteenPermission.findUnique({
      where: { key },
    });
    if (existing) {
      throw new ConflictException(
        `Permission with key "${key}" already exists in database`,
      );
    }

    return this.prisma.canteenPermission.create({
      data: {
        key,
        resource: dto.resource.trim().toLowerCase(),
        action: dto.action.trim().toLowerCase(),
        name: dto.name,
        category: dto.category,
        description: dto.description,
        is_system: false,
        is_active: true,
      },
    });
  }

  async updatePermission(
    actor: CanteenPlatformUser,
    id: number,
    dto: UpdateCanteenCustomPermissionDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getPermission(id);
    return this.prisma.canteenPermission.update({
      where: { permission_id: id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });
  }

  async deletePermission(actor: CanteenPlatformUser, id: number) {
    this.requireInstituteAdmin(actor);
    const perm = await this.getPermission(id);
    if (perm.is_system) {
      throw new ForbiddenException(
        'System default permissions cannot be deleted',
      );
    }
    return this.prisma.canteenPermission.delete({
      where: { permission_id: id },
    });
  }

  private requireInstituteAdmin(actor: CanteenPlatformUser) {
    if (!isCanteenAdmin(actor)) {
      throw new ForbiddenException(
        'Only Institute Admin can manage the Canteen permission catalog',
      );
    }
  }
}

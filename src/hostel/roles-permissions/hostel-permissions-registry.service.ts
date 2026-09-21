import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateHostelCustomPermissionDto,
  UpdateHostelCustomPermissionDto,
} from './dto/create-custom-permission.dto';
import { HOSTEL_RESOURCE_CATALOG } from './hostel-permission-catalog';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { isHostelAdmin } from '../common/hostel-access.service';

@Injectable()
export class HostelPermissionsRegistryService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedDefaultPermissions();
    } catch (err) {
      console.error('Failed to seed default Hostel permissions:', err);
    }
  }

  /**
   * Auto-seeds system default permissions into hostel_permissions_catalog in
   * one idempotent createMany({ skipDuplicates: true }) — the unique `key`
   * constraint makes Postgres skip rows that already exist.
   */
  async seedDefaultPermissions() {
    const data = HOSTEL_RESOURCE_CATALOG.flatMap((item) =>
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
    await this.prisma.hostelPermission.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async listPermissions() {
    const list = await this.prisma.hostelPermission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const resourcesMap = new Map<
      string,
      {
        resource: string;
        name: string;
        available_actions: string[];
        permissions: (typeof list)[number][];
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
    const perm = await this.prisma.hostelPermission.findUnique({
      where: { permission_id: id },
    });
    if (!perm) throw new NotFoundException(`Permission #${id} not found`);
    return perm;
  }

  async createPermission(
    actor: HostelPlatformUser,
    dto: CreateHostelCustomPermissionDto,
  ) {
    this.requireInstituteAdmin(actor);
    const resource = dto.resource.trim().toLowerCase();
    const action = dto.action.trim().toLowerCase();
    const key = `${resource}:${action}`;
    const existing = await this.prisma.hostelPermission.findUnique({
      where: { key },
    });
    if (existing) {
      throw new ConflictException(
        `Permission with key "${key}" already exists`,
      );
    }

    return this.prisma.hostelPermission.create({
      data: {
        key,
        resource,
        action,
        name: dto.name,
        category: dto.category,
        description: dto.description,
        is_system: false,
        is_active: true,
      },
    });
  }

  async updatePermission(
    actor: HostelPlatformUser,
    id: number,
    dto: UpdateHostelCustomPermissionDto,
  ) {
    this.requireInstituteAdmin(actor);
    await this.getPermission(id);
    return this.prisma.hostelPermission.update({
      where: { permission_id: id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });
  }

  async deletePermission(actor: HostelPlatformUser, id: number) {
    this.requireInstituteAdmin(actor);
    const perm = await this.getPermission(id);
    if (perm.is_system) {
      throw new ForbiddenException(
        'System default permissions cannot be deleted',
      );
    }
    return this.prisma.hostelPermission.delete({
      where: { permission_id: id },
    });
  }

  private requireInstituteAdmin(actor: HostelPlatformUser) {
    if (!isHostelAdmin(actor)) {
      throw new ForbiddenException(
        'Only Institute Admin can manage the Hostel permission catalog',
      );
    }
  }
}

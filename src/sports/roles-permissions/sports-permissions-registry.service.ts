import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateSportsCustomPermissionDto, UpdateSportsCustomPermissionDto } from './dto/create-custom-permission.dto';
import { SPORTS_RESOURCE_CATALOG } from './dto/create-dynamic-role.dto';

@Injectable()
export class SportsPermissionsRegistryService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.seedDefaultPermissions();
    } catch (err) {
      console.error('Failed to seed default Sports permissions:', err);
    }
  }

  /** Auto-seeds system default permissions into sports_permissions DB table */
  async seedDefaultPermissions() {
    for (const item of SPORTS_RESOURCE_CATALOG) {
      for (const action of item.available_actions) {
        const key = `${item.resource}:${action}`;
        const name = `${action.toUpperCase()} ${item.name}`;

        const existing = await this.prisma.sportsPermission.findUnique({
          where: { key },
        });

        if (!existing) {
          await this.prisma.sportsPermission.create({
            data: {
              key,
              resource: item.resource,
              action,
              name,
              category: item.name,
              description: item.description,
              is_system: true,
              is_active: true,
            },
          });
        }
      }
    }
  }

  // ─── Dynamic Permissions DB CRUD ──────────────────────────────────────────

  async listPermissions() {
    const list = await this.prisma.sportsPermission.findMany({
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const resourcesMap = new Map<string, { resource: string; name: string; available_actions: string[]; permissions: any[] }>();

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
    const perm = await this.prisma.sportsPermission.findUnique({ where: { permission_id: id } });
    if (!perm) throw new NotFoundException(`Permission #${id} not found`);
    return perm;
  }

  async createPermission(dto: CreateSportsCustomPermissionDto) {
    const key = `${dto.resource.trim().toLowerCase()}:${dto.action.trim().toLowerCase()}`;
    const existing = await this.prisma.sportsPermission.findUnique({ where: { key } });
    if (existing) {
      throw new ConflictException(`Permission with key "${key}" already exists in database`);
    }

    return this.prisma.sportsPermission.create({
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

  async updatePermission(id: number, dto: UpdateSportsCustomPermissionDto) {
    await this.getPermission(id);
    return this.prisma.sportsPermission.update({
      where: { permission_id: id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.category && { category: dto.category }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.is_active !== undefined && { is_active: dto.is_active }),
      },
    });
  }

  async deletePermission(id: number) {
    const perm = await this.getPermission(id);
    if (perm.is_system) {
      throw new ForbiddenException('System default permissions cannot be deleted');
    }
    return this.prisma.sportsPermission.delete({ where: { permission_id: id } });
  }
}

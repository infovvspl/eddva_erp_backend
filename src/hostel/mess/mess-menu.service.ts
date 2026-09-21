import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { HostelDayOfWeek, HostelMealType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HostelPlatformUser } from '../auth/hostel-auth.service';
import { HostelAuditService } from '../common/hostel-audit.service';
import { HOSTEL_ENTITY } from '../common/hostel-entities';
import { orConflict } from '../common/unique-violation.util';
import { localToday, parseDateOnly } from '../common/time.util';
import { buildMeta, parsePagination } from '../common/pagination.util';
import {
  CreateMessMenuDto,
  QueryMessMenuDto,
  UpdateMessMenuDto,
} from './dto/mess.dto';

const DAYS: HostelDayOfWeek[] = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
];
const MEALS: HostelMealType[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

export function dayOfWeekOf(date: Date): HostelDayOfWeek {
  return DAYS[date.getUTCDay()];
}

/**
 * The hostel mess is a meal opt-in/attendance system, not a POS — so the menu
 * is a plain day × meal × items schedule with an effective-from date rather
 * than the Canteen's priced, orderable item catalog (those are different
 * things; the Canteen is also a separate auth island and is not linked here).
 */
@Injectable()
export class MessMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HostelAuditService,
  ) {}

  async create(actor: HostelPlatformUser, dto: CreateMessMenuDto) {
    const effective = parseDateOnly(dto.effective_from, 'effective_from');
    const message = `A ${dto.meal_type} menu for ${dto.day_of_week} effective ${dto.effective_from} already exists`;
    const menu = await orConflict(message, async () => {
      const dup = await this.prisma.hostelMessMenu.findUnique({
        where: {
          institute_id_day_of_week_meal_type_effective_from: {
            institute_id: actor.institute_id,
            day_of_week: dto.day_of_week,
            meal_type: dto.meal_type,
            effective_from: effective,
          },
        },
        select: { menu_id: true },
      });
      if (dup) throw new ConflictException(message);
      return this.prisma.hostelMessMenu.create({
        data: {
          institute_id: actor.institute_id,
          day_of_week: dto.day_of_week,
          meal_type: dto.meal_type,
          items: dto.items.map((i) => i.trim()),
          effective_from: effective,
          is_active: dto.is_active ?? true,
          created_by: actor.eddva_user_id,
        },
      });
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_MENU,
      entityId: String(menu.menu_id),
      action: 'create',
      metadata: {
        day: menu.day_of_week,
        meal: menu.meal_type,
        effective_from: dto.effective_from,
      },
    });
    return menu;
  }

  async findAll(instituteId: string, query: QueryMessMenuDto) {
    const { skip, take, page, limit } = parsePagination(query);
    const where: Prisma.HostelMessMenuWhereInput = {
      institute_id: instituteId,
      day_of_week: query.day_of_week,
      meal_type: query.meal_type,
      is_active: query.is_active,
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.hostelMessMenu.findMany({
        where,
        orderBy: [
          { effective_from: 'desc' },
          { day_of_week: 'asc' },
          { meal_type: 'asc' },
        ],
        skip,
        take,
      }),
      this.prisma.hostelMessMenu.count({ where }),
    ]);
    return { data, pagination: buildMeta(total, page, limit) };
  }

  async findOne(instituteId: string, id: number) {
    const menu = await this.prisma.hostelMessMenu.findFirst({
      where: { menu_id: id, institute_id: instituteId },
    });
    if (!menu) throw new NotFoundException(`Mess menu #${id} not found`);
    return menu;
  }

  async update(actor: HostelPlatformUser, id: number, dto: UpdateMessMenuDto) {
    const before = await this.findOne(actor.institute_id, id);
    const effective = dto.effective_from
      ? parseDateOnly(dto.effective_from, 'effective_from')
      : undefined;
    const updated = await orConflict(
      'A menu for that day, meal and effective date already exists',
      () =>
        this.prisma.hostelMessMenu.update({
          where: { menu_id: id },
          data: {
            items: dto.items?.map((i) => i.trim()),
            effective_from: effective,
            is_active: dto.is_active,
          },
        }),
    );
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_MENU,
      entityId: String(id),
      action: 'update',
      metadata: {
        day: before.day_of_week,
        meal: before.meal_type,
        changes: dto,
      },
    });
    return updated;
  }

  /** "Delete" = deactivate: the menu stops applying but the record stays for history. */
  async deactivate(actor: HostelPlatformUser, id: number) {
    await this.findOne(actor.institute_id, id);
    const updated = await this.prisma.hostelMessMenu.update({
      where: { menu_id: id },
      data: { is_active: false },
    });
    await this.audit.log(actor, {
      entityType: HOSTEL_ENTITY.MESS_MENU,
      entityId: String(id),
      action: 'deactivate',
    });
    return updated;
  }

  /**
   * For every day × meal, the active menu whose effective_from is the latest one
   * on or before `date`. One query, resolved in memory.
   */
  private async inForce(instituteId: string, date: Date) {
    const menus = await this.prisma.hostelMessMenu.findMany({
      where: {
        institute_id: instituteId,
        is_active: true,
        effective_from: { lte: date },
      },
      orderBy: { effective_from: 'desc' },
    });
    const picked = new Map<string, (typeof menus)[number]>();
    for (const menu of menus) {
      const key = `${menu.day_of_week}:${menu.meal_type}`;
      if (!picked.has(key)) picked.set(key, menu); // newest first → first one wins
    }
    return picked;
  }

  async forDay(
    instituteId: string,
    day: HostelDayOfWeek | undefined,
    dateStr?: string,
  ) {
    const date = dateStr ? parseDateOnly(dateStr, 'date') : localToday();
    const dayName = day ?? dayOfWeekOf(date);
    const picked = await this.inForce(instituteId, date);
    return {
      date: date.toISOString().slice(0, 10),
      day_of_week: dayName,
      meals: Object.fromEntries(
        MEALS.map((meal) => [meal, picked.get(`${dayName}:${meal}`) ?? null]),
      ),
    };
  }

  async weekly(instituteId: string, dateStr?: string) {
    const date = dateStr ? parseDateOnly(dateStr, 'date') : localToday();
    const picked = await this.inForce(instituteId, date);
    return {
      as_of: date.toISOString().slice(0, 10),
      days: [...DAYS.slice(1), DAYS[0]].map((day) => ({
        day_of_week: day,
        meals: Object.fromEntries(
          MEALS.map((meal) => [meal, picked.get(`${day}:${meal}`) ?? null]),
        ),
      })),
    };
  }
}

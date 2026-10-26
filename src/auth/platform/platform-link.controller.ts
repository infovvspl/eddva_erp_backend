import { Body, Controller, ConflictException, HttpCode, NotFoundException, Put, UseGuards } from '@nestjs/common';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../prisma/prisma.service';
import { InternalKeyGuard } from './internal-key.guard';

export class LinkPlatformUserDto {
  /** ERP institute the user belongs to (the LMS institute id). */
  @IsString()
  @MinLength(1)
  instituteId: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  platformUserId: string;
}

@Controller('internal/platform')
@UseGuards(InternalKeyGuard)
export class PlatformLinkController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Binds an existing ERP user to a platform identity so their platform tokens are accepted.
   * Idempotent. Refuses to re-point a link, so a mistaken call can't hand one account's
   * access to a different person.
   */
  @Put('users/link')
  @HttpCode(200)
  async link(@Body() dto: LinkPlatformUserDto) {
    const user = await this.prisma.user.findFirst({
      where: { instituteId: dto.instituteId, email: { equals: dto.email, mode: 'insensitive' } },
    });
    if (!user) throw new NotFoundException('No ERP user with that email in this institute');

    if (user.platformUserId === dto.platformUserId) return { userId: user.id, linked: true };
    if (user.platformUserId) throw new ConflictException('ERP user is already linked to another platform user');

    const taken = await this.prisma.user.findUnique({ where: { platformUserId: dto.platformUserId } });
    if (taken) throw new ConflictException('Platform user is already linked to another ERP user');

    await this.prisma.user.update({ where: { id: user.id }, data: { platformUserId: dto.platformUserId } });
    return { userId: user.id, linked: true };
  }
}

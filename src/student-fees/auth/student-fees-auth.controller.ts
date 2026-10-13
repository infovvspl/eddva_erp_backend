import { Controller, Get, Query, UseGuards, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StudentFeesAuthService } from './student-fees-auth.service';
import { StudentFeesJwtGuard } from './student-fees-jwt.guard';
import { FeeUser } from './student-fees-user.decorator';
import type { FeePlatformUser } from './student-fees-auth.service';

@ApiTags('Student Fees / Auth (SSO)')
@Controller('api/student-fees/auth')
export class StudentFeesAuthController {
  constructor(private readonly authService: StudentFeesAuthService) {}

  @Get('sso')
  @ApiOperation({ summary: 'Exchange EDDVA Institute Admin JWT for a Student Fees JWT' })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({ status: 200, description: 'SSO exchange successful. Returns fee_token.' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) throw new UnauthorizedException('Query parameter "token" is required');
    return this.authService.exchangeSsoToken(token);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(StudentFeesJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Student Fees user info' })
  getMe(@FeeUser() user: FeePlatformUser) {
    return user;
  }
}

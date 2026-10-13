import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { StaffAuthService } from './staff-auth.service';
import { StaffDirectLoginDto } from './dto/direct-login.dto';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffUser } from './staff-user.decorator';
import type { StaffPlatformUser } from './staff-auth.service';

@ApiTags('Staff / Auth (SSO)')
@Controller('api/staff/auth')
export class StaffAuthController {
  constructor(private readonly authService: StaffAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for a Staff JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns staff_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Get('teacher-sso')
  @ApiOperation({
    summary: "Exchange a teacher's own LMS JWT for a self-service Staff JWT",
    description:
      'Only grants access to /api/staff/me/* — the teacher is scoped to their own StaffMember row, never the full Staff admin surface.',
  })
  @ApiQuery({ name: 'token', description: "Teacher's LMS session token" })
  @ApiResponse({ status: 200, description: 'Exchange successful. Returns staff_token.' })
  @ApiResponse({ status: 401, description: 'Invalid token, not a teacher login, or no linked staff record' })
  async teacherSsoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeTeacherSsoToken(token);
  }

  @Post('login')
  @ApiOperation({
    summary:
      'Direct login for assigned Staff users (HR Officer, Department Head, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns staff_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: StaffDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(StaffJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Staff user info' })
  getMe(@StaffUser() user: StaffPlatformUser) {
    return user;
  }
}

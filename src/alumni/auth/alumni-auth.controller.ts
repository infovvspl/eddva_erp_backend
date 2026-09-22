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
import { AlumniAuthService } from './alumni-auth.service';
import { AlumniRegistrationService } from './alumni-registration.service';
import { AlumniDirectLoginDto } from './dto/direct-login.dto';
import { ChangePasswordDto, RegisterAlumniDto } from './dto/register.dto';
import { AlumniInstituteAdminViewOnlyGuard } from './alumni-institute-admin-view-only.guard';
import { AlumniJwtGuard } from './alumni-jwt.guard';
import { AlumniPermissionsGuard } from './alumni-permissions.guard';
import { RequirePermissions, StaffOnly } from './require-permissions.decorator';
import { AlumniUser } from './alumni-user.decorator';
import type { AlumniPlatformUser } from './alumni-auth.service';

@ApiTags('Alumni / Auth (SSO)')
@Controller('api/alumni/auth')
export class AlumniAuthController {
  constructor(
    private readonly authService: AlumniAuthService,
    private readonly registration: AlumniRegistrationService,
  ) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for an Alumni JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns alumni_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({
    summary:
      'Direct login for assigned Alumni users (Alumni Relations Officer, other office staff) and alumni portal accounts',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns alumni_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: AlumniDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Post('register')
  @ApiBearerAuth()
  @UseGuards(
    AlumniJwtGuard,
    AlumniInstituteAdminViewOnlyGuard,
    AlumniPermissionsGuard,
  )
  @StaffOnly()
  @RequirePermissions(
    { resource: 'alumni', action: 'create' },
    { resource: 'alumni', action: 'issue_account' },
  )
  @ApiOperation({
    summary:
      'Create an alumni profile and portal login together, in one call (staff only — needs alumni:create + alumni:issue_account). ' +
      "Alumni never self-register: nothing here can prove ownership of an e-mail address, so an authenticated staff member always creates the record on the alumnus's behalf.",
  })
  @ApiResponse({
    status: 201,
    description:
      'Created. Returns the new alumni_id and the login username — never a session token for the new account.',
  })
  @ApiResponse({
    status: 409,
    description:
      'A profile with this e-mail / student reference already exists',
  })
  register(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: RegisterAlumniDto,
  ) {
    return this.registration.register(user, dto);
  }

  @Post('change-password')
  @ApiBearerAuth()
  @UseGuards(AlumniJwtGuard)
  @ApiOperation({ summary: 'Change the password of the logged-in account' })
  changePassword(
    @AlumniUser() user: AlumniPlatformUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(
      user,
      dto.current_password,
      dto.new_password,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AlumniJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Alumni user info' })
  getMe(@AlumniUser() user: AlumniPlatformUser) {
    return user;
  }
}

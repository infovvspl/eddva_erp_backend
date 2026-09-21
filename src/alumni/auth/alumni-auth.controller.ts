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
import { AlumniJwtGuard } from './alumni-jwt.guard';
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
  @ApiOperation({
    summary:
      'Alumni self-registration (public). Creates a PENDING profile and a portal account; staff verify it afterwards',
  })
  @ApiResponse({ status: 201, description: 'Registered; returns alumni_token' })
  @ApiResponse({
    status: 409,
    description:
      'A profile with this e-mail / student reference already exists',
  })
  register(@Body() dto: RegisterAlumniDto) {
    return this.registration.register(dto);
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

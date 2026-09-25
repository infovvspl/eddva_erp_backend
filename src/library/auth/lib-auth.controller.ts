import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { LibAuthService } from './lib-auth.service';
import { LibDirectLoginDto } from './dto/login.dto';

@ApiTags('Library / Auth (SSO)')
@Controller('api/library/auth')
export class LibAuthController {
  constructor(private readonly authService: LibAuthService) {}

  /**
   * GET /api/v1/library/auth/sso?token=<eddva_jwt>
   *
   * Called by EDDVA ERPWorkspace.jsx when the Institute Admin clicks
   * the "Library Management" card.
   *
   * Returns JSON { library_token, user } for the frontend to store
   * and then navigate to /library/permissions.
   */
  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA JWT → Library Platform JWT (SSO)',
    description:
      'Validates the EDDVA Institute Admin token, issues a Library Platform JWT, and returns user context. The Library frontend stores the token and redirects to /library/permissions.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  async sso(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Missing token query parameter');
    }
    return this.authService.exchangeSsoToken(token);
  }

  /**
   * POST /api/v1/library/auth/login
   * Direct login for assigned role users (Librarians, etc.) using username & password
   * created by the Institute Admin.
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Direct Login for Assigned Role Users',
    description:
      'Allows Librarians and staff assigned custom dynamic roles by Institute Admin to log in directly using username/email and password created for them.',
  })
  async login(@Body() dto: LibDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  /**
   * GET /api/v1/library/auth/me
   * Returns the current Library Platform user from Bearer token.
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current Library Platform user from bearer token' })
  me(@Query('token') token: string) {
    if (!token) {
      throw new BadRequestException('Missing token');
    }
    return this.authService.verifyLibraryToken(token);
  }
}

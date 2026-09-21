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
import { HostelAuthService } from './hostel-auth.service';
import { HostelDirectLoginDto } from './dto/direct-login.dto';
import { HostelJwtGuard } from './hostel-jwt.guard';
import { HostelUser } from './hostel-user.decorator';
import type { HostelPlatformUser } from './hostel-auth.service';

@ApiTags('Hostel / Auth (SSO)')
@Controller('api/hostel/auth')
export class HostelAuthController {
  constructor(private readonly authService: HostelAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for a Hostel JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns hostel_token.',
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
      'Direct login for assigned Hostel users (Warden, Gate Security, Hostel Accountant, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns hostel_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: HostelDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(HostelJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Hostel user info' })
  getMe(@HostelUser() user: HostelPlatformUser) {
    return user;
  }
}

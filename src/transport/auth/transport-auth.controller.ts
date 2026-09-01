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
import { TransportAuthService } from './transport-auth.service';
import { TransportDirectLoginDto } from './dto/direct-login.dto';
import { TransportJwtGuard } from './transport-jwt.guard';
import { TransportUser } from './transport-user.decorator';
import type { TransportPlatformUser } from './transport-auth.service';

@ApiTags('Transport / Auth (SSO)')
@Controller('api/transport/auth')
export class TransportAuthController {
  constructor(private readonly authService: TransportAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for a Transport Platform JWT',
    description: 'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({ status: 200, description: 'SSO exchange successful. Returns transport_token.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Direct login for assigned Transport users (Admin, Dispatcher, Driver App User)' })
  @ApiResponse({ status: 200, description: 'Login successful. Returns transport_token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: TransportDirectLoginDto) {
    return this.authService.directLogin(dto.username, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(TransportJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Transport Platform user info' })
  async getMe(@TransportUser() user: TransportPlatformUser) {
    return user;
  }
}

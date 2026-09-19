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
import { CanteenAuthService } from './canteen-auth.service';
import { CanteenDirectLoginDto } from './dto/direct-login.dto';
import { CanteenJwtGuard } from './canteen-jwt.guard';
import { CanteenUser } from './canteen-user.decorator';
import type { CanteenPlatformUser } from './canteen-auth.service';

@ApiTags('Canteen / Auth (SSO)')
@Controller('api/canteen/auth')
export class CanteenAuthController {
  constructor(private readonly authService: CanteenAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary:
      'Exchange EDDVA Institute Admin JWT for a Canteen Platform JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns canteen_token.',
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
      'Direct login for assigned Canteen users (Counter Staff, Canteen Manager, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns canteen_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: CanteenDirectLoginDto) {
    return this.authService.directLogin(dto.username, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(CanteenJwtGuard)
  @ApiOperation({
    summary: 'Get current authenticated Canteen Platform user info',
  })
  async getMe(@CanteenUser() user: CanteenPlatformUser) {
    return user;
  }
}

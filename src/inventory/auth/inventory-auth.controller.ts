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
import { InventoryAuthService } from './inventory-auth.service';
import { InventoryDirectLoginDto } from './dto/direct-login.dto';
import { InventoryJwtGuard } from './inventory-jwt.guard';
import { InventoryUser } from './inventory-user.decorator';
import type { InventoryPlatformUser } from './inventory-auth.service';

@ApiTags('Inventory / Auth (SSO)')
@Controller('api/inventory/auth')
export class InventoryAuthController {
  constructor(private readonly authService: InventoryAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for an Inventory Platform JWT',
    description: 'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({ status: 200, description: 'SSO exchange successful. Returns inventory_token.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Direct login for assigned Inventory users (Admin, Store Keeper, Approver)' })
  @ApiResponse({ status: 200, description: 'Login successful. Returns inventory_token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: InventoryDirectLoginDto) {
    return this.authService.directLogin(dto.username, dto.password);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(InventoryJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Inventory Platform user info' })
  async getMe(@InventoryUser() user: InventoryPlatformUser) {
    return user;
  }
}

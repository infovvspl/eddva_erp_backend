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
import { SalesPurchaseAuthService } from './sales-purchase-auth.service';
import { SalesPurchaseDirectLoginDto } from './dto/direct-login.dto';
import { SalesPurchaseJwtGuard } from './sales-purchase-jwt.guard';
import { SalesPurchaseUser } from './sales-purchase-user.decorator';
import type { SalesPurchasePlatformUser } from './sales-purchase-auth.service';

@ApiTags('Sales & Purchase / Auth (SSO)')
@Controller('api/sales-purchase/auth')
export class SalesPurchaseAuthController {
  constructor(private readonly authService: SalesPurchaseAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary:
      'Exchange EDDVA Institute Admin JWT for a Sales & Purchase Platform JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns sales_purchase_token.',
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
      'Direct login for assigned Sales & Purchase users (Purchase Clerk, Sales Clerk, Approver, Accounts)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns sales_purchase_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: SalesPurchaseDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(SalesPurchaseJwtGuard)
  @ApiOperation({
    summary: 'Get current authenticated Sales & Purchase Platform user info',
  })
  async getMe(@SalesPurchaseUser() user: SalesPurchasePlatformUser) {
    return user;
  }
}

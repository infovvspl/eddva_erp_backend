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
import { AccountsAuthService } from './accounts-auth.service';
import { AccountsDirectLoginDto } from './dto/direct-login.dto';
import { AccountsJwtGuard } from './accounts-jwt.guard';
import { AccountsUser } from './accounts-user.decorator';
import type { AccountsPlatformUser } from './accounts-auth.service';

@ApiTags('Accounts / Auth (SSO)')
@Controller('api/accounts/auth')
export class AccountsAuthController {
  constructor(private readonly authService: AccountsAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for an Accounts Platform JWT',
    description: 'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({ status: 200, description: 'SSO exchange successful. Returns accounts_token.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Direct login for assigned Accounts users (Accounts Clerk, Accountant, Finance Admin)' })
  @ApiResponse({ status: 200, description: 'Login successful. Returns accounts_token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: AccountsDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AccountsJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Accounts Platform user info' })
  async getMe(@AccountsUser() user: AccountsPlatformUser) {
    return user;
  }
}

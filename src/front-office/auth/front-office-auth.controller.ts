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
import { FrontOfficeAuthService } from './front-office-auth.service';
import { FrontOfficeDirectLoginDto } from './dto/direct-login.dto';
import { FrontOfficeJwtGuard } from './front-office-jwt.guard';
import { FrontOfficeUser } from './front-office-user.decorator';
import type { FrontOfficePlatformUser } from './front-office-auth.service';

@ApiTags('Front Office / Auth (SSO)')
@Controller('api/front-office/auth')
export class FrontOfficeAuthController {
  constructor(private readonly authService: FrontOfficeAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for a Front Office Platform JWT',
    description: 'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({ status: 200, description: 'SSO exchange successful. Returns front_office_token.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({ summary: 'Direct login for assigned Front Office users (Front Desk, Department Staff, Managers)' })
  @ApiResponse({ status: 200, description: 'Login successful. Returns front_office_token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: FrontOfficeDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(FrontOfficeJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Front Office Platform user info' })
  async getMe(@FrontOfficeUser() user: FrontOfficePlatformUser) {
    return user;
  }
}

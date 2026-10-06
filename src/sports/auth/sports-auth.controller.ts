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
} from '@nestjs/swagger';
import { SportsAuthService } from './sports-auth.service';
import { SportsDirectLoginDto } from './dto/direct-login.dto';
import { SportsJwtGuard } from './sports-jwt.guard';
import { SportsUser } from './sports-user.decorator';
import type { SportsPlatformUser } from './sports-auth.service';

@ApiTags('Sports / Auth (SSO)')
@Controller('api/sports/auth')
export class SportsAuthController {
  constructor(private readonly authService: SportsAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for Sports Platform JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiResponse({ status: 200, description: 'SSO Exchange successful. Returns sports_token.' })
  @ApiResponse({ status: 401, description: 'Invalid or expired EDDVA token' })
  async ssoExchange(@Query('token') token: string) {
    if (!token) {
      throw new UnauthorizedException('Query parameter "token" is required');
    }
    return this.authService.exchangeSsoToken(token);
  }

  @Post('login')
  @ApiOperation({
    summary: 'Direct login for assigned Sports users (Coaches, House Masters, Sports Admins)',
  })
  @ApiResponse({ status: 200, description: 'Login successful. Returns sports_token.' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: SportsDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(SportsJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Sports Platform user info' })
  async getMe(@SportsUser() user: SportsPlatformUser) {
    return user;
  }
}

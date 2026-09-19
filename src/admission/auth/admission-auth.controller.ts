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
import { AdmissionAuthService } from './admission-auth.service';
import { AdmissionDirectLoginDto } from './dto/direct-login.dto';
import { AdmissionJwtGuard } from './admission-jwt.guard';
import { AdmissionUser } from './admission-user.decorator';
import type { AdmissionPlatformUser } from './admission-auth.service';

@ApiTags('Admission / Auth (SSO)')
@Controller('api/admission/auth')
export class AdmissionAuthController {
  constructor(private readonly authService: AdmissionAuthService) {}

  @Get('sso')
  @ApiOperation({
    summary: 'Exchange EDDVA Institute Admin JWT for an Admission JWT',
    description:
      'Frontend calls this upon redirect from EDDVA ERP, passing the EDDVA token in the query param string.',
  })
  @ApiQuery({ name: 'token', description: 'EDDVA JWT from localStorage' })
  @ApiResponse({
    status: 200,
    description: 'SSO exchange successful. Returns admission_token.',
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
      'Direct login for assigned Admission users (Admission Officer, Interview Evaluator, etc.)',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful. Returns admission_token.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async directLogin(@Body() dto: AdmissionDirectLoginDto) {
    return this.authService.directLogin(
      dto.username,
      dto.password,
      dto.institute_id,
    );
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AdmissionJwtGuard)
  @ApiOperation({ summary: 'Get current authenticated Admission user info' })
  getMe(@AdmissionUser() user: AdmissionPlatformUser) {
    return user;
  }
}

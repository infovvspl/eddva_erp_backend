import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';

@ApiTags('Central Authentication')
@Controller('api')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @ApiOperation({ summary: 'User login' })
  @Post('auth/login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @ApiOperation({ summary: 'Exchange an LMS-issued SSO bridge token for a normal ERP session' })
  @Post('auth/sso')
  async sso(@Body('token') token: string) {
    return this.authService.ssoLogin(token);
  }

  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async getMe(@GetUser() user: any) {
    return this.authService.getMe(user.id || user.userId);
  }

  @ApiOperation({ summary: 'Mint a short-lived bridge token for switching this admin session to the LMS' })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('auth/lms-sso-token')
  async mintLmsSsoToken(@GetUser() user: any) {
    return this.authService.mintLmsSsoToken(user);
  }
}


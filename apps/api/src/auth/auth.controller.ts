import { Body, Controller, Get, Patch, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public } from '../common/guards';

class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

class RefreshDto {
  @IsString()
  userId!: string;

  @IsString()
  refreshToken!: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}

class UpdateProfileDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mangoExtension?: string;
}

class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString() @MinLength(6) newPassword!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password, dto.deviceId);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.userId, dto.refreshToken, dto.deviceId);
  }

  @ApiBearerAuth()
  @Post('logout')
  logout(@Req() req: any) {
    return this.auth.logout(req.user.id);
  }

  @ApiBearerAuth()
  @Get('me')
  me(@Req() req: any) {
    return this.auth.me(req.user.id);
  }

  @ApiBearerAuth()
  @Patch('me')
  updateMe(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.auth.updateProfile(req.user.id, dto);
  }

  @ApiBearerAuth()
  @Post('me/password')
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}

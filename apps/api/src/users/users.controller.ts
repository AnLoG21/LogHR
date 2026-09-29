import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { Roles } from '../common/guards';
import { UsersService } from './users.service';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(6) password!: string;
  @IsString() firstName!: string;
  @IsString() lastName!: string;
  @IsOptional() @IsString() middleName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsEnum(SystemRole) role!: SystemRole;
  @IsOptional() @IsUUID() orgUnitId?: string;
}

@ApiTags('users')
@ApiBearerAuth()
@Roles(SystemRole.ADMIN)
@Controller('users')
export class UsersController {
  constructor(private users: UsersService) {}

  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
    @Query('role') role?: SystemRole,
  ) {
    return this.users.list({ page, pageSize, search, role });
  }

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateUserDto> & { isActive?: boolean }) {
    return this.users.update(id, dto);
  }
}

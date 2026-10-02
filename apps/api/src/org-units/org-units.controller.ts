import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { Roles } from '../common/guards';
import { OrgUnitsService } from './org-units.service';

class CreateOrgUnitDto {
  @IsString() name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() legalEntity?: string;
}

@ApiTags('org-units')
@ApiBearerAuth()
@Controller('org-units')
export class OrgUnitsController {
  constructor(private service: OrgUnitsService) {}

  @Get()
  list(
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('archived') archived?: string,
  ) {
    return this.service.list({ page, pageSize, search, city, archived: archived === 'true' });
  }

  @Get('tree')
  tree() {
    return this.service.tree();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Post()
  create(@Body() dto: CreateOrgUnitDto) {
    return this.service.create(dto);
  }

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateOrgUnitDto> & { isActive?: boolean }) {
    return this.service.update(id, dto);
  }
}

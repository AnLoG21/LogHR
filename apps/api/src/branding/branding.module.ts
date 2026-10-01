import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';

@Injectable()
export class BrandingService {
  constructor(private prisma: PrismaService) {}

  async get() {
    let branding = await this.prisma.branding.findFirst();
    if (!branding) {
      branding = await this.prisma.branding.create({
        data: {
          companyName: process.env.BRAND_NAME || 'ТАЙМЫР ИНВЕСТ',
          primaryColor: process.env.BRAND_PRIMARY_COLOR || '#0a4ea3',
          secondaryColor: '#1ea64a',
        },
      });
    }
    return branding;
  }

  async update(data: { companyName?: string; primaryColor?: string; secondaryColor?: string; logoUrl?: string }) {
    const current = await this.get();
    return this.prisma.branding.update({ where: { id: current.id }, data });
  }
}

@ApiTags('branding')
@Controller('branding')
export class BrandingController {
  constructor(private service: BrandingService) {}

  @Public()
  @Get()
  get() { return this.service.get(); }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Post()
  update(@Body() dto: { companyName?: string; primaryColor?: string; secondaryColor?: string; logoUrl?: string }) {
    return this.service.update(dto);
  }
}

@Module({ controllers: [BrandingController], providers: [BrandingService], exports: [BrandingService] })
export class BrandingModule {}

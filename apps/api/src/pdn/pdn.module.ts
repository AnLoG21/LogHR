import { Body, Controller, Get, Injectable, Module, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { Public, Roles } from '../common/guards';

@Injectable()
export class PdnService {
  constructor(private prisma: PrismaService) {}

  list() {
    return this.prisma.pdnDocument.findMany();
  }

  async upsert(type: string, title: string, content: string) {
    return this.prisma.pdnDocument.upsert({
      where: { type },
      create: { type, title, content },
      update: { title, content },
    });
  }

  async getPublic() {
    const docs = await this.list();
    return {
      policy: docs.find((d) => d.type === 'POLICY'),
      consent: docs.find((d) => d.type === 'CONSENT'),
    };
  }
}

@ApiTags('pdn')
@Controller('pdn')
export class PdnController {
  constructor(private service: PdnService) {}

  @ApiBearerAuth()
  @Get()
  list() { return this.service.list(); }

  @Public()
  @Get('public')
  publicDocs() { return this.service.getPublic(); }

  @ApiBearerAuth()
  @Roles(SystemRole.ADMIN)
  @Post()
  upsert(@Body() dto: { type: string; title: string; content: string }) {
    return this.service.upsert(dto.type, dto.title, dto.content);
  }
}

@Module({ controllers: [PdnController], providers: [PdnService], exports: [PdnService] })
export class PdnModule {}

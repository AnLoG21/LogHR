import {
  Controller, Get, Injectable, Module, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SystemRole } from '@prisma/client';
import * as ExcelJS from 'exceljs';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../common/guards';

@Injectable()
export class ImportExportService {
  constructor(private prisma: PrismaService) {}

  async exportEntity(entity: string): Promise<ExcelJS.Workbook> {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(entity);

    if (entity === 'org-units') {
      ws.columns = [
        { header: 'id', key: 'id' },
        { header: 'name', key: 'name' },
        { header: 'code', key: 'code' },
        { header: 'city', key: 'city' },
        { header: 'address', key: 'address' },
        { header: 'legalEntity', key: 'legalEntity' },
      ];
      const rows = await this.prisma.orgUnit.findMany();
      rows.forEach((r) => ws.addRow(r));
    } else if (entity === 'candidates') {
      ws.columns = [
        { header: 'id', key: 'id' },
        { header: 'lastName', key: 'lastName' },
        { header: 'firstName', key: 'firstName' },
        { header: 'phone', key: 'phone' },
        { header: 'email', key: 'email' },
        { header: 'city', key: 'city' },
        { header: 'source', key: 'source' },
      ];
      const rows = await this.prisma.candidate.findMany({ take: 5000 });
      rows.forEach((r) => ws.addRow(r));
    } else if (entity === 'users') {
      ws.columns = [
        { header: 'id', key: 'id' },
        { header: 'email', key: 'email' },
        { header: 'lastName', key: 'lastName' },
        { header: 'firstName', key: 'firstName' },
        { header: 'role', key: 'role' },
      ];
      const rows = await this.prisma.user.findMany();
      rows.forEach((r) => ws.addRow(r));
    } else if (entity === 'hiring-requests') {
      ws.columns = [
        { header: 'id', key: 'id' },
        { header: 'title', key: 'title' },
        { header: 'status', key: 'status' },
        { header: 'city', key: 'city' },
        { header: 'positionsCount', key: 'positionsCount' },
      ];
      const rows = await this.prisma.hiringRequest.findMany();
      rows.forEach((r) => ws.addRow(r));
    } else {
      ws.addRow({ message: 'Unknown entity' });
    }
    return wb;
  }

  async importCandidates(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    let imported = 0;
    const headers: string[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, col) => {
          headers[col] = String(cell.value || '').trim();
        });
        return;
      }
      const data: Record<string, any> = {};
      row.eachCell((cell, col) => {
        data[headers[col]] = cell.value;
      });
      if (!data.lastName && !data.firstName) return;
      // fire and forget sync create - collect promises outside
      (row as any)._importData = data;
      imported++;
    });

    const creates: Promise<any>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const data = (row as any)._importData;
      if (!data) return;
      creates.push(
        this.prisma.candidate.create({
          data: {
            lastName: String(data.lastName || 'Импорт'),
            firstName: String(data.firstName || 'Кандидат'),
            phone: data.phone ? String(data.phone) : undefined,
            email: data.email ? String(data.email) : undefined,
            city: data.city ? String(data.city) : undefined,
            source: 'MANUAL',
            addType: 'MANUAL',
          },
        }),
      );
    });
    await Promise.all(creates);
    return { imported: creates.length };
  }

  async importOrgUnits(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    const headers: string[] = [];
    const creates: Promise<any>[] = [];
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) {
        row.eachCell((cell, col) => {
          headers[col] = String(cell.value || '').trim();
        });
        return;
      }
      const data: Record<string, any> = {};
      row.eachCell((cell, col) => {
        data[headers[col]] = cell.value;
      });
      if (!data.name) return;
      creates.push(
        this.prisma.orgUnit.create({
          data: {
            name: String(data.name),
            code: data.code ? String(data.code) : undefined,
            city: data.city ? String(data.city) : undefined,
            address: data.address ? String(data.address) : undefined,
            legalEntity: data.legalEntity ? String(data.legalEntity) : undefined,
          },
        }),
      );
    });
    await Promise.all(creates);
    return { imported: creates.length };
  }
}

@ApiTags('import-export')
@ApiBearerAuth()
@Controller('import-export')
export class ImportExportController {
  constructor(private service: ImportExportService) {}

  @Roles(SystemRole.ADMIN, SystemRole.HR_BP, SystemRole.RECRUITMENT_LEAD)
  @Get('export')
  async export(@Query('entity') entity: string, @Res() res: Response) {
    const wb = await this.service.exportEntity(entity || 'candidates');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${entity || 'export'}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  }

  @Roles(SystemRole.ADMIN)
  @Post('import/candidates')
  @UseInterceptors(FileInterceptor('file'))
  importCandidates(@UploadedFile() file: Express.Multer.File) {
    return this.service.importCandidates(file.buffer);
  }

  @Roles(SystemRole.ADMIN)
  @Post('import/org-units')
  @UseInterceptors(FileInterceptor('file'))
  importOrgUnits(@UploadedFile() file: Express.Multer.File) {
    return this.service.importOrgUnits(file.buffer);
  }
}

@Module({ controllers: [ImportExportController], providers: [ImportExportService], exports: [ImportExportService] })
export class ImportExportModule {}

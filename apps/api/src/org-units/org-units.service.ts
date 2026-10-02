import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class OrgUnitsService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; search?: string; city?: string; archived?: boolean }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.OrgUnitWhereInput = {
      AND: [
        query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { code: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {},
        query.city ? { city: { contains: query.city, mode: 'insensitive' } } : {},
        query.archived ? {} : { isActive: true },
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.orgUnit.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
        include: {
          parent: { select: { id: true, name: true } },
          _count: { select: { hiringRequests: true, demands: true } },
        },
      }),
      this.prisma.orgUnit.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async tree() {
    const units = await this.prisma.orgUnit.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    const byParent = new Map<string | null, typeof units>();
    for (const u of units) {
      const key = u.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(u);
    }
    const build = (parentId: string | null): any[] =>
      (byParent.get(parentId) || []).map((u) => ({
        ...u,
        children: build(u.id),
      }));
    return build(null);
  }

  async create(data: {
    name: string;
    code?: string;
    parentId?: string | null;
    city?: string;
    address?: string;
    legalEntity?: string;
  }) {
    return this.prisma.orgUnit.create({ data });
  }

  async update(id: string, data: Partial<{
    name: string;
    code: string;
    parentId: string | null;
    city: string;
    address: string;
    legalEntity: string;
    isActive: boolean;
  }>) {
    const exists = await this.prisma.orgUnit.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException();
    const patch: Prisma.OrgUnitUncheckedUpdateInput = {};
    if (data.name !== undefined) patch.name = String(data.name).trim() || exists.name;
    if (data.code !== undefined) patch.code = data.code || null;
    if (data.city !== undefined) patch.city = data.city || null;
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.legalEntity !== undefined) patch.legalEntity = data.legalEntity || null;
    if (data.isActive !== undefined) patch.isActive = !!data.isActive;
    if (data.parentId !== undefined) {
      const parentId = data.parentId || null;
      if (parentId === id) throw new BadRequestException('Подразделение не может входить само в себя');
      let cursor = parentId;
      while (cursor) {
        const p: { parentId: string | null } | null = await this.prisma.orgUnit.findUnique({ where: { id: cursor }, select: { parentId: true } });
        if (!p) throw new BadRequestException('Родительское подразделение не найдено');
        if (p.parentId === id) throw new BadRequestException('Нельзя вложить подразделение в его же дочернее');
        cursor = p.parentId;
      }
      patch.parentId = parentId;
    }
    return this.prisma.orgUnit.update({ where: { id }, data: patch });
  }

  async get(id: string) {
    const item = await this.prisma.orgUnit.findUnique({
      where: { id },
      include: {
        parent: true,
        demands: { include: { candidateProfile: true } },
        hiringRequests: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException();
    return item;
  }
}

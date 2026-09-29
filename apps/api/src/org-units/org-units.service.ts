import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class OrgUnitsService {
  constructor(private prisma: PrismaService) {}

  async list(query: { page?: number; pageSize?: number; search?: string; city?: string }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.OrgUnitWhereInput = {
      AND: [
        query.search
          ? {
              OR: [
                { name: { contains: query.search } },
                { code: { contains: query.search } },
              ],
            }
          : {},
        query.city ? { city: { contains: query.city } } : {},
        { isActive: true },
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
    return this.prisma.orgUnit.update({ where: { id }, data });
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

import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma, SystemRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { pageResult, paginate } from '../common/pagination';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  directory() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, firstName: true, lastName: true, middleName: true, role: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async list(query: { page?: number; pageSize?: number; search?: string; role?: SystemRole }) {
    const { skip, take, page, pageSize } = paginate(query.page, query.pageSize);
    const where: Prisma.UserWhereInput = {
      AND: [
        query.search
          ? {
              OR: [
                { email: { contains: query.search } },
                { firstName: { contains: query.search } },
                { lastName: { contains: query.search } },
              ],
            }
          : {},
        query.role ? { role: query.role } : {},
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { lastName: 'asc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          middleName: true,
          phone: true,
          role: true,
          isActive: true,
          orgUnitId: true,
          orgUnit: { select: { id: true, name: true } },
          createdAt: true,
        },
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, page, pageSize);
  }

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    middleName?: string;
    phone?: string;
    role: SystemRole;
    orgUnitId?: string;
  }) {
    const exists = await this.prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (exists) throw new ConflictException('Email уже используется');
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        role: data.role,
        orgUnitId: data.orgUnitId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        orgUnitId: true,
      },
    });
  }

  async update(id: string, data: Partial<{
    firstName: string;
    lastName: string;
    middleName: string;
    phone: string;
    role: SystemRole;
    orgUnitId: string | null;
    isActive: boolean;
    password: string;
  }>) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException();
    const passwordHash = data.password ? await bcrypt.hash(data.password, 10) : undefined;
    return this.prisma.user.update({
      where: { id },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        middleName: data.middleName,
        phone: data.phone,
        role: data.role,
        orgUnitId: data.orgUnitId,
        isActive: data.isActive,
        ...(passwordHash ? { passwordHash } : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        orgUnitId: true,
      },
    });
  }
}

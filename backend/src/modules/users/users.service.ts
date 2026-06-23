import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const userResponseSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  committeeId: true,
  committee: {
    select: {
      id: true,
      name: true,
    },
  },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const PROTECTED_ADMIN_EMAILS = new Set([
  'ab443442@gmail.com',
  'admin@example.com',
]);

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto) {
    const committeeId = this.resolveCommitteeId(
      createUserDto.role,
      createUserDto.committeeId ?? null,
    );

    await this.ensureCommitteeExists(committeeId);

    try {
      return await this.prisma.user.create({
        data: {
          name: createUserDto.name,
          email: createUserDto.email,
          passwordHash: await bcrypt.hash(createUserDto.password, 12),
          role: createUserDto.role,
          committeeId,
        },
        select: userResponseSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAll() {
    return this.prisma.user.findMany({
      select: userResponseSelect,
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: userResponseSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        role: true,
        committeeId: true,
      },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found.');
    }

    const role = updateUserDto.role ?? existingUser.role;
    const hasCommitteeId = Object.prototype.hasOwnProperty.call(
      updateUserDto,
      'committeeId',
    );
    const suppliedCommitteeId = hasCommitteeId
      ? updateUserDto.committeeId ?? null
      : role === UserRole.ADMIN
        ? null
        : existingUser.committeeId;
    const committeeId = this.resolveCommitteeId(role, suppliedCommitteeId);

    await this.ensureCommitteeExists(committeeId);

    const data: Prisma.UserUpdateInput = {
      ...(updateUserDto.name !== undefined && { name: updateUserDto.name }),
      ...(updateUserDto.email !== undefined && { email: updateUserDto.email }),
      role,
      committee:
        committeeId === null
          ? { disconnect: true }
          : { connect: { id: committeeId } },
    };

    if (updateUserDto.password !== undefined) {
      data.passwordHash = await bcrypt.hash(updateUserDto.password, 12);
    }

    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: userResponseSelect,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (PROTECTED_ADMIN_EMAILS.has(user.email.toLowerCase())) {
      throw new ConflictException(
        'لا يمكن حذف حساب المدير الأساسي',
      );
    }

    try {
      return await this.prisma.user.delete({
        where: { id },
        select: userResponseSelect,
      });
    } catch (error) {
      this.handlePrismaError(error, true);
    }
  }

  private resolveCommitteeId(
    role: UserRole,
    committeeId: string | null,
  ): string | null {
    if (role === UserRole.ADMIN) {
      if (committeeId !== null) {
        throw new BadRequestException(
          'ADMIN users cannot be assigned to a committee.',
        );
      }

      return null;
    }

    if (!committeeId) {
      throw new BadRequestException(
        'committeeId is required for DATA_ENTRY users.',
      );
    }

    return committeeId;
  }

  private async ensureCommitteeExists(committeeId: string | null) {
    if (committeeId === null) {
      return;
    }

    const committee = await this.prisma.committee.findUnique({
      where: { id: committeeId },
      select: { id: true },
    });

    if (!committee) {
      throw new BadRequestException('Assigned committee does not exist.');
    }
  }

  private handlePrismaError(error: unknown, deleting = false): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('A user with this email already exists.');
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          deleting
            ? 'User cannot be deleted because they are still referenced.'
            : 'The assigned committee does not exist.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('User not found.');
      }
    }

    throw error;
  }
}

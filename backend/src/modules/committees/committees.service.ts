import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCommitteeDto } from './dto/create-committee.dto';
import { UpdateCommitteeDto } from './dto/update-committee.dto';

@Injectable()
export class CommitteesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCommitteeDto: CreateCommitteeDto) {
    try {
      return await this.prisma.committee.create({
        data: createCommitteeDto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAll() {
    return this.prisma.committee.findMany({
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  async findOne(id: string) {
    const committee = await this.prisma.committee.findUnique({
      where: { id },
    });

    if (!committee) {
      throw new NotFoundException('Committee not found.');
    }

    return committee;
  }

  async update(id: string, updateCommitteeDto: UpdateCommitteeDto) {
    await this.findOne(id);

    try {
      return await this.prisma.committee.update({
        where: { id },
        data: updateCommitteeDto,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    try {
      return await this.prisma.committee.delete({
        where: { id },
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException('A committee with this name already exists.');
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          'Committee cannot be deleted because it is still in use.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Committee not found.');
      }
    }

    throw error;
  }
}

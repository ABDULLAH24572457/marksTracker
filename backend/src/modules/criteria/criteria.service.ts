import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';

const criterionInclude = {
  committee: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.CriterionInclude;

@Injectable()
export class CriteriaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createCriterionDto: CreateCriterionDto) {
    await this.ensureCommitteeExists(createCriterionDto.committeeId);
    await this.ensureTitleIsUnique(
      createCriterionDto.title,
      createCriterionDto.committeeId,
    );

    try {
      return await this.prisma.criterion.create({
        data: createCriterionDto,
        include: criterionInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAll() {
    return this.prisma.criterion.findMany({
      include: criterionInclude,
      orderBy: [
        {
          committee: {
            name: 'asc',
          },
        },
        {
          displayOrder: 'asc',
        },
        {
          title: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const criterion = await this.prisma.criterion.findUnique({
      where: { id },
      include: criterionInclude,
    });

    if (!criterion) {
      throw new NotFoundException('Criterion not found.');
    }

    return criterion;
  }

  async update(id: string, updateCriterionDto: UpdateCriterionDto) {
    const existingCriterion = await this.prisma.criterion.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        committeeId: true,
      },
    });

    if (!existingCriterion) {
      throw new NotFoundException('Criterion not found.');
    }

    const title = updateCriterionDto.title ?? existingCriterion.title;
    const committeeId =
      updateCriterionDto.committeeId ?? existingCriterion.committeeId;

    await this.ensureCommitteeExists(committeeId);
    await this.ensureTitleIsUnique(title, committeeId, id);

    try {
      return await this.prisma.criterion.update({
        where: { id },
        data: updateCriterionDto,
        include: criterionInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    try {
      return await this.prisma.criterion.delete({
        where: { id },
        include: criterionInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, true);
    }
  }

  private async ensureCommitteeExists(committeeId: string) {
    const committee = await this.prisma.committee.findUnique({
      where: { id: committeeId },
      select: { id: true },
    });

    if (!committee) {
      throw new BadRequestException('Committee does not exist.');
    }
  }

  private async ensureTitleIsUnique(
    title: string,
    committeeId: string,
    excludedId?: string,
  ) {
    const duplicate = await this.prisma.criterion.findFirst({
      where: {
        committeeId,
        title: {
          equals: title,
          mode: 'insensitive',
        },
        ...(excludedId && {
          id: {
            not: excludedId,
          },
        }),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        'A criterion with this title already exists in the committee.',
      );
    }
  }

  private handlePrismaError(error: unknown, deleting = false): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        throw new ConflictException(
          deleting
            ? 'Criterion cannot be deleted because it is referenced by scores.'
            : 'Committee does not exist.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Criterion not found.');
      }
    }

    throw error;
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { UpdateFamilyDto } from './dto/update-family.dto';

const familyInclude = {
  stage: {
    select: {
      id: true,
      name: true,
    },
  },
} satisfies Prisma.FamilyInclude;

@Injectable()
export class FamiliesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createFamilyDto: CreateFamilyDto) {
    await this.ensureStageExists(createFamilyDto.stageId);
    await this.ensureNameIsUnique(
      createFamilyDto.name,
      createFamilyDto.stageId,
    );

    try {
      return await this.prisma.family.create({
        data: createFamilyDto,
        include: familyInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  findAll() {
    return this.prisma.family.findMany({
      include: familyInclude,
      orderBy: [
        {
          stage: {
            name: 'asc',
          },
        },
        {
          name: 'asc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const family = await this.prisma.family.findUnique({
      where: { id },
      include: familyInclude,
    });

    if (!family) {
      throw new NotFoundException('Family not found.');
    }

    return family;
  }

  async update(id: string, updateFamilyDto: UpdateFamilyDto) {
    const existingFamily = await this.prisma.family.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        stageId: true,
      },
    });

    if (!existingFamily) {
      throw new NotFoundException('Family not found.');
    }

    const name = updateFamilyDto.name ?? existingFamily.name;
    const stageId = updateFamilyDto.stageId ?? existingFamily.stageId;

    await this.ensureStageExists(stageId);
    await this.ensureNameIsUnique(name, stageId, id);

    try {
      return await this.prisma.family.update({
        where: { id },
        data: updateFamilyDto,
        include: familyInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    await this.findOne(id);

    try {
      return await this.prisma.family.delete({
        where: { id },
        include: familyInclude,
      });
    } catch (error) {
      this.handlePrismaError(error, true);
    }
  }

  private async ensureStageExists(stageId: string) {
    const stage = await this.prisma.stage.findUnique({
      where: { id: stageId },
      select: { id: true },
    });

    if (!stage) {
      throw new BadRequestException('Stage does not exist.');
    }
  }

  private async ensureNameIsUnique(
    name: string,
    stageId: string,
    excludedId?: string,
  ) {
    const duplicate = await this.prisma.family.findFirst({
      where: {
        stageId,
        name: {
          equals: name,
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
        'A family with this name already exists in the stage.',
      );
    }
  }

  private handlePrismaError(error: unknown, deleting = false): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          'A family with this name already exists in the stage.',
        );
      }

      if (error.code === 'P2003') {
        throw new ConflictException(
          deleting
            ? 'Family cannot be deleted because it is referenced by scores.'
            : 'Stage does not exist.',
        );
      }

      if (error.code === 'P2025') {
        throw new NotFoundException('Family not found.');
      }
    }

    throw error;
  }
}

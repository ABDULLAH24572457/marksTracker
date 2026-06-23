import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ScoringCycleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type CommitteeBreakdown = {
  committeeId: string;
  committeeName: string;
  earnedScore: number;
  maxPossibleScore: number;
  weightPercentage: number;
  weightedScore: number;
};

export type FamilyRanking = {
  familyId: string;
  familyName: string;
  totalScore: number;
  rank: number;
  committeeBreakdown: CommitteeBreakdown[];
};

type CommitteeAccumulator = {
  committeeId: string;
  committeeName: string;
  earnedScore: Prisma.Decimal;
  maxPossibleScore: Prisma.Decimal;
  weightPercentage: Prisma.Decimal;
};

@Injectable()
export class RankingsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(): Promise<FamilyRanking[]> {
    const currentResults = await this.getCurrentResults();

    return currentResults.rankings;
  }

  async getCurrentResults(): Promise<{
    scoringCycle: {
      id: string;
      name: string;
    };
    rankings: FamilyRanking[];
  }> {
    const scoringCycle = await this.getActiveScoringCycle();
    const families = await this.prisma.family.findMany({
      select: {
        id: true,
        name: true,
        scores: {
          where: {
            scoringCycleId: scoringCycle.id,
          },
          select: {
            score: true,
            criterion: {
              select: {
                maxScore: true,
                committee: {
                  select: {
                    id: true,
                    name: true,
                    weightPercentage: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const rankings = families
      .map((family) => this.calculateFamilyRanking(family))
      .sort(
        (first, second) =>
          second.totalScore - first.totalScore ||
          first.familyName.localeCompare(second.familyName),
      );

    return {
      scoringCycle,
      rankings: this.assignRanks(rankings),
    };
  }

  async findFamily(familyId: string): Promise<FamilyRanking> {
    const familyExists = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { id: true },
    });

    if (!familyExists) {
      throw new NotFoundException('Family not found.');
    }

    const rankings = await this.findAll();
    const familyRanking = rankings.find(
      (ranking) => ranking.familyId === familyId,
    );

    if (!familyRanking) {
      throw new NotFoundException('Family ranking not found.');
    }

    return familyRanking;
  }

  private async getActiveScoringCycle() {
    const scoringCycle = await this.prisma.scoringCycle.findFirst({
      where: {
        status: ScoringCycleStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    if (!scoringCycle) {
      throw new NotFoundException('No active scoring cycle was found.');
    }

    return scoringCycle;
  }

  private calculateFamilyRanking(family: {
    id: string;
    name: string;
    scores: Array<{
      score: Prisma.Decimal;
      criterion: {
        maxScore: Prisma.Decimal;
        committee: {
          id: string;
          name: string;
          weightPercentage: Prisma.Decimal;
        };
      };
    }>;
  }): FamilyRanking {
    const committees = new Map<string, CommitteeAccumulator>();

    for (const score of family.scores) {
      const committee = score.criterion.committee;
      const existing = committees.get(committee.id);

      if (existing) {
        existing.earnedScore = existing.earnedScore.plus(score.score);
        existing.maxPossibleScore = existing.maxPossibleScore.plus(
          score.criterion.maxScore,
        );
        continue;
      }

      committees.set(committee.id, {
        committeeId: committee.id,
        committeeName: committee.name,
        earnedScore: new Prisma.Decimal(score.score),
        maxPossibleScore: new Prisma.Decimal(score.criterion.maxScore),
        weightPercentage: new Prisma.Decimal(committee.weightPercentage),
      });
    }

    let totalScore = new Prisma.Decimal(0);
    const committeeBreakdown = Array.from(committees.values())
      .map((committee) => {
        const weightedScore = committee.maxPossibleScore.isZero()
          ? new Prisma.Decimal(0)
          : committee.earnedScore
              .dividedBy(committee.maxPossibleScore)
              .times(committee.weightPercentage);

        totalScore = totalScore.plus(weightedScore);

        return {
          committeeId: committee.committeeId,
          committeeName: committee.committeeName,
          earnedScore: this.toNumber(committee.earnedScore, 2),
          maxPossibleScore: this.toNumber(
            committee.maxPossibleScore,
            2,
          ),
          weightPercentage: this.toNumber(
            committee.weightPercentage,
            2,
          ),
          weightedScore: this.toNumber(weightedScore, 4),
        };
      })
      .sort((first, second) =>
        first.committeeName.localeCompare(second.committeeName),
      );

    return {
      familyId: family.id,
      familyName: family.name,
      totalScore: this.toNumber(totalScore, 4),
      rank: 0,
      committeeBreakdown,
    };
  }

  private assignRanks(rankings: FamilyRanking[]): FamilyRanking[] {
    let previousScore: number | null = null;
    let previousRank = 0;

    return rankings.map((ranking, index) => {
      const rank =
        previousScore !== null && ranking.totalScore === previousScore
          ? previousRank
          : index + 1;

      previousScore = ranking.totalScore;
      previousRank = rank;

      return {
        ...ranking,
        rank,
      };
    });
  }

  private toNumber(value: Prisma.Decimal, decimalPlaces: number): number {
    return value.toDecimalPlaces(decimalPlaces).toNumber();
  }
}

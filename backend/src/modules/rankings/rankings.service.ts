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
  stageId: string;
  stageName: string;
  totalScore: number;
  rank: number;
  overallRank: number;
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
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
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

    const calculatedRankings = families.map((family) =>
      this.calculateFamilyRanking(family),
    );
    const overallRankings = this.assignRanks(
      [...calculatedRankings].sort(this.compareRankings),
      'overallRank',
    );
    const rankings = this.assignStageRanks(overallRankings).sort(
      (first, second) =>
        first.stageName.localeCompare(second.stageName) ||
        first.rank - second.rank ||
        first.familyName.localeCompare(second.familyName),
    );

    return {
      scoringCycle,
      rankings,
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
    stage: {
      id: string;
      name: string;
    };
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
      stageId: family.stage.id,
      stageName: family.stage.name,
      totalScore: this.toNumber(totalScore, 4),
      rank: 0,
      overallRank: 0,
      committeeBreakdown,
    };
  }

  private assignStageRanks(rankings: FamilyRanking[]): FamilyRanking[] {
    const stageGroups = new Map<string, FamilyRanking[]>();

    for (const ranking of rankings) {
      const stageRankings = stageGroups.get(ranking.stageId) ?? [];
      stageRankings.push(ranking);
      stageGroups.set(ranking.stageId, stageRankings);
    }

    return Array.from(stageGroups.values()).flatMap((stageRankings) =>
      this.assignRanks(
        stageRankings.sort(this.compareRankings),
        'rank',
      ),
    );
  }

  private assignRanks(
    rankings: FamilyRanking[],
    field: 'rank' | 'overallRank',
  ): FamilyRanking[] {
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
        [field]: rank,
      };
    });
  }

  private compareRankings(first: FamilyRanking, second: FamilyRanking) {
    return (
      second.totalScore - first.totalScore ||
      first.familyName.localeCompare(second.familyName)
    );
  }

  private toNumber(value: Prisma.Decimal, decimalPlaces: number): number {
    return value.toDecimalPlaces(decimalPlaces).toNumber();
  }
}

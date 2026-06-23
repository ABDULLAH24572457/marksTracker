import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  CommitteeBreakdown,
  FamilyRanking,
  RankingsService,
} from '../rankings/rankings.service';

const ARABIC_PATTERN = /[\u0600-\u06ff]/;
const ARABIC_FONT_PATH = require.resolve(
  '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff',
);

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rankingsService: RankingsService,
  ) {}

  getFinalResults() {
    return this.rankingsService.findAll();
  }

  async generateFinalResultsPdf(): Promise<Buffer> {
    const { scoringCycle, rankings } =
      await this.rankingsService.getCurrentResults();
    const document = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 36,
      bufferPages: true,
      info: {
        Title: 'Final Results',
        Subject: `Final rankings for ${scoringCycle.name}`,
        Creator: 'Marks Tracker',
      },
    });
    const chunks: Buffer[] = [];
    const completed = new Promise<Buffer>((resolve, reject) => {
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('end', () => resolve(Buffer.concat(chunks)));
      document.on('error', reject);
    });

    document.registerFont('Arabic', ARABIC_FONT_PATH);
    this.drawReportHeader(document, scoringCycle.name);

    if (rankings.length === 0) {
      document
        .moveDown(2)
        .font('Helvetica')
        .fontSize(12)
        .text('No families are available for ranking.');
    } else {
      this.drawRankingsTable(document, rankings);
    }

    this.drawPageFooters(document);
    document.end();

    return completed;
  }

  async createFinalResultsSnapshot(user: AuthenticatedUser) {
    const { scoringCycle, rankings } =
      await this.rankingsService.getCurrentResults();
    const familyStages = await this.prisma.family.findMany({
      select: {
        id: true,
        stage: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
    const scores = await this.prisma.score.findMany({
      where: {
        scoringCycleId: scoringCycle.id,
      },
      select: {
        score: true,
        family: {
          select: {
            id: true,
            name: true,
            stage: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        criterion: {
          select: {
            id: true,
            title: true,
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
    });
    const stageByFamilyId = new Map(
      familyStages.map((family) => [family.id, family.stage]),
    );
    const stageRanks = this.calculateStageRanks(rankings, stageByFamilyId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const latestSnapshot = await transaction.scoreArchive.aggregate({
          where: {
            scoringCycleId: scoringCycle.id,
          },
          _max: {
            snapshotVersion: true,
          },
        });
        const snapshotVersion =
          (latestSnapshot._max.snapshotVersion ?? 0) + 1;
        const archive = await transaction.scoreArchive.create({
          data: {
            scoringCycleId: scoringCycle.id,
            snapshotVersion,
            archivedById: user.id,
            formulaVersion: 'normalized-v1',
            rankings: {
              create: rankings.map((ranking) => {
                const stage = stageByFamilyId.get(ranking.familyId);

                if (!stage) {
                  throw new ConflictException(
                    `Stage data is missing for family ${ranking.familyId}.`,
                  );
                }

                return {
                  familyId: ranking.familyId,
                  familyName: ranking.familyName,
                  stageId: stage.id,
                  stageName: stage.name,
                  finalScore: ranking.totalScore,
                  overallRank: ranking.rank,
                  stageRank: stageRanks.get(ranking.familyId) ?? 0,
                  breakdown:
                    ranking.committeeBreakdown as unknown as Prisma.InputJsonValue,
                };
              }),
            },
            items: {
              create: scores.map((score) => ({
                familyId: score.family.id,
                familyName: score.family.name,
                stageId: score.family.stage.id,
                stageName: score.family.stage.name,
                committeeId: score.criterion.committee.id,
                committeeName: score.criterion.committee.name,
                committeeWeight:
                  score.criterion.committee.weightPercentage,
                criterionId: score.criterion.id,
                criterionTitle: score.criterion.title,
                criterionMaxScore: score.criterion.maxScore,
                score: score.score,
              })),
            },
          },
          select: {
            id: true,
            scoringCycleId: true,
            snapshotVersion: true,
            formulaVersion: true,
            archivedAt: true,
            _count: {
              select: {
                rankings: true,
                items: true,
              },
            },
          },
        });

        await transaction.auditLog.create({
          data: {
            userId: user.id,
            action: 'CREATE_FINAL_RESULTS_SNAPSHOT',
            entityType: 'ScoreArchive',
            entityId: archive.id,
            newValue: {
              scoringCycleId: scoringCycle.id,
              snapshotVersion: archive.snapshotVersion,
              familyCount: archive._count.rankings,
              scoreCount: archive._count.items,
            },
          },
        });

        return {
          ...archive,
          scoringCycleName: scoringCycle.name,
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A snapshot was created concurrently. Please retry.',
        );
      }

      throw error;
    }
  }

  private calculateStageRanks(
    rankings: FamilyRanking[],
    stageByFamilyId: Map<string, { id: string; name: string }>,
  ): Map<string, number> {
    const familiesByStage = new Map<string, FamilyRanking[]>();

    for (const ranking of rankings) {
      const stage = stageByFamilyId.get(ranking.familyId);

      if (!stage) {
        continue;
      }

      const stageFamilies = familiesByStage.get(stage.id) ?? [];
      stageFamilies.push(ranking);
      familiesByStage.set(stage.id, stageFamilies);
    }

    const stageRanks = new Map<string, number>();

    for (const stageFamilies of familiesByStage.values()) {
      let previousScore: number | null = null;
      let previousRank = 0;

      stageFamilies
        .sort(
          (first, second) =>
            second.totalScore - first.totalScore ||
            first.familyName.localeCompare(second.familyName),
        )
        .forEach((family, index) => {
          const rank =
            previousScore !== null &&
            family.totalScore === previousScore
              ? previousRank
              : index + 1;

          stageRanks.set(family.familyId, rank);
          previousScore = family.totalScore;
          previousRank = rank;
        });
    }

    return stageRanks;
  }

  private drawReportHeader(
    document: PDFKit.PDFDocument,
    scoringCycleName: string,
  ) {
    document
      .font('Helvetica-Bold')
      .fontSize(20)
      .fillColor('#111827')
      .text('Final Competition Results', {
        align: 'center',
      })
      .moveDown(0.35)
      .font('Helvetica')
      .fontSize(10)
      .fillColor('#4b5563')
      .text('Scoring cycle', {
        align: 'center',
      })
      .font(ARABIC_PATTERN.test(scoringCycleName) ? 'Arabic' : 'Helvetica')
      .text(scoringCycleName, {
        align: 'center',
      })
      .font('Helvetica')
      .text(`Generated: ${new Date().toISOString()}`, {
        align: 'center',
      })
      .moveDown(1.25);
  }

  private drawRankingsTable(
    document: PDFKit.PDFDocument,
    rankings: FamilyRanking[],
  ) {
    const left = document.page.margins.left;
    const tableWidth =
      document.page.width -
      document.page.margins.left -
      document.page.margins.right;
    const columns = {
      rank: 48,
      family: 180,
      total: 82,
      breakdown: tableWidth - 310,
    };
    let y = document.y;

    const drawHeader = () => {
      document
        .rect(left, y, tableWidth, 26)
        .fill('#1f2937');
      document
        .fillColor('#ffffff')
        .font('Helvetica-Bold')
        .fontSize(9);
      this.drawCell(document, 'Rank', left, y, columns.rank, 26);
      this.drawCell(
        document,
        'Family',
        left + columns.rank,
        y,
        columns.family,
        26,
      );
      this.drawCell(
        document,
        'Total',
        left + columns.rank + columns.family,
        y,
        columns.total,
        26,
      );
      this.drawCell(
        document,
        'Committee breakdown',
        left + columns.rank + columns.family + columns.total,
        y,
        columns.breakdown,
        26,
      );
      y += 26;
    };

    drawHeader();

    for (const [index, ranking] of rankings.entries()) {
      const rowHeight = Math.max(
        30,
        ranking.committeeBreakdown.length * 14 + 12,
      );
      const pageBottom =
        document.page.height - document.page.margins.bottom - 22;

      if (y + rowHeight > pageBottom) {
        document.addPage();
        y = document.page.margins.top;
        drawHeader();
      }

      document
        .rect(left, y, tableWidth, rowHeight)
        .fill(index % 2 === 0 ? '#f9fafb' : '#ffffff')
        .strokeColor('#d1d5db')
        .lineWidth(0.5)
        .rect(left, y, tableWidth, rowHeight)
        .stroke();

      document.fillColor('#111827').font('Helvetica').fontSize(9);
      this.drawCell(
        document,
        ranking.rank.toString(),
        left,
        y,
        columns.rank,
        rowHeight,
      );
      this.drawNameCell(
        document,
        ranking.familyName,
        left + columns.rank,
        y,
        columns.family,
        rowHeight,
      );
      this.drawCell(
        document,
        ranking.totalScore.toFixed(4),
        left + columns.rank + columns.family,
        y,
        columns.total,
        rowHeight,
      );
      this.drawCommitteeBreakdown(
        document,
        ranking.committeeBreakdown,
        left + columns.rank + columns.family + columns.total,
        y,
        columns.breakdown,
      );

      y += rowHeight;
    }
  }

  private drawCell(
    document: PDFKit.PDFDocument,
    text: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    document.text(text, x + 6, y + 8, {
      width: width - 12,
      height: height - 12,
      align: 'center',
      ellipsis: true,
    });
  }

  private drawNameCell(
    document: PDFKit.PDFDocument,
    name: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const isArabic = ARABIC_PATTERN.test(name);

    document
      .font(isArabic ? 'Arabic' : 'Helvetica')
      .fontSize(9)
      .text(name, x + 6, y + 7, {
        width: width - 12,
        height: height - 12,
        align: isArabic ? 'right' : 'left',
        ellipsis: true,
      });
  }

  private drawCommitteeBreakdown(
    document: PDFKit.PDFDocument,
    breakdown: CommitteeBreakdown[],
    x: number,
    y: number,
    width: number,
  ) {
    if (breakdown.length === 0) {
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text('No scores entered', x + 6, y + 9, {
          width: width - 12,
        });
      return;
    }

    breakdown.forEach((committee, index) => {
      const isArabic = ARABIC_PATTERN.test(committee.committeeName);
      const line =
        `${committee.committeeName} | ` +
        `${committee.earnedScore.toFixed(2)}/` +
        `${committee.maxPossibleScore.toFixed(2)} | ` +
        `${committee.weightPercentage.toFixed(2)}% | ` +
        `${committee.weightedScore.toFixed(4)}`;

      document
        .font(isArabic ? 'Arabic' : 'Helvetica')
        .fontSize(7.5)
        .fillColor('#374151')
        .text(line, x + 6, y + 7 + index * 14, {
          width: width - 12,
          height: 13,
          align: isArabic ? 'right' : 'left',
          ellipsis: true,
        });
    });
  }

  private drawPageFooters(document: PDFKit.PDFDocument) {
    const pageRange = document.bufferedPageRange();

    for (let index = 0; index < pageRange.count; index += 1) {
      document.switchToPage(pageRange.start + index);
      document
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#6b7280')
        .text(
          `Page ${index + 1} of ${pageRange.count}`,
          document.page.margins.left,
          document.page.height - 24,
          {
            width:
              document.page.width -
              document.page.margins.left -
              document.page.margins.right,
            align: 'center',
          },
        );
    }
  }
}

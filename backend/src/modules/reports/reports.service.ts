import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { existsSync, readFileSync } from 'node:fs';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  FamilyRanking,
  RankingsService,
} from '../rankings/rankings.service';

const ARABIC_FONT_PATH = require.resolve(
  '@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff2',
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
    const committees = await this.prisma.committee.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: this.getBrowserExecutablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(
        this.buildDetailedResultsHtml(
          rankings,
          committees,
        ),
        { waitUntil: 'load' },
      );
      await page.evaluate(() => document.fonts.ready);
      await page.emulateMediaType('print');

      const pdf = await page.pdf({
        format: 'A4',
        landscape: true,
        printBackground: true,
        preferCSSPageSize: true,
      });

      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
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
                  overallRank: ranking.overallRank,
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

  private buildDetailedResultsHtml(
    rankings: FamilyRanking[],
    committees: Array<{ id: string; name: string }>,
  ) {
    const fontBase64 = readFileSync(ARABIC_FONT_PATH).toString('base64');
    const generatedAt = this.formatReportDate(new Date());
    const stageGroups = new Map<string, FamilyRanking[]>();

    for (const ranking of rankings) {
      const stageRankings = stageGroups.get(ranking.stageId) ?? [];
      stageRankings.push(ranking);
      stageGroups.set(ranking.stageId, stageRankings);
    }

    const stages = Array.from(stageGroups.values()).sort(
      (first, second) =>
        this.getStageOrder(first[0].stageName) -
        this.getStageOrder(second[0].stageName),
    );
    const content =
      stages.length > 0
        ? stages
            .map((stage) => this.renderStage(stage, committees))
            .join('')
        : '<div class="empty">لا توجد نتائج متاحة.</div>';

    return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    @font-face {
      font-family: "Noto Sans Arabic";
      src: url(data:font/woff2;base64,${fontBase64}) format("woff2");
      font-weight: 400;
      font-style: normal;
    }
    @page {
      size: A4 landscape;
      margin: 7mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      direction: rtl;
      color: #000000;
      background: #FFFFFF;
      font-family: "Noto Sans Arabic", Arial, sans-serif;
      font-size: 10px;
      line-height: 1.4;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-header {
      text-align: center;
      margin-bottom: 18px;
      border-bottom: 2px solid #18174A;
      padding-bottom: 12px;
    }
    .report-title {
      margin: 0;
      color: #18174A;
      font-size: 23px;
      font-weight: 700;
    }
    .report-meta {
      margin-top: 5px;
      color: #000000;
      font-size: 11px;
    }
    .stage-section {
      margin-top: 18px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .stage-title {
      margin: 0 0 8px;
      padding: 7px 11px;
      color: #ffffff;
      background: #18174A;
      font-size: 17px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 9px;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      padding: 6px 3px;
      color: #ffffff;
      background: #18174A;
      border: 1px solid #DDE3EA;
      font-weight: 700;
      text-align: center;
      line-height: 1.35;
    }
    td {
      padding: 7px 3px;
      color: #000000;
      background: #FFFFFF;
      border: 1px solid #DDE3EA;
      text-align: center;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td { background: #F8FAFC; }
    .family-name {
      text-align: right;
      font-weight: 700;
      font-size: 10px;
      white-space: normal;
    }
    .rank-column { width: 4.5%; }
    .family-column { width: 12%; }
    .percentage-column { width: 6%; }
    .committee-column { width: auto; }
    .total-column { width: 7%; }
    .committee-group {
      color: #000000;
      background: #94B8AB;
      font-size: 9px;
    }
    .committee-group.tone-1 { background: #67CDFF; }
    .committee-group.tone-2 { background: #F8FAFC; }
    .sub-header {
      color: #000000;
      background: #EAF2F0;
      font-size: 8px;
    }
    .weighted {
      color: #18174A;
      font-weight: 700;
    }
    .final-total {
      color: #18174A;
      font-size: 10px;
      font-weight: 700;
    }
    .empty {
      padding: 60px 20px;
      text-align: center;
      color: #64748b;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <header class="report-header">
    <h1 class="report-title">النتائج العامة للتقييم</h1>
    <div class="report-meta">تاريخ التقرير: ${generatedAt}</div>
  </header>
  ${content}
</body>
</html>`;
  }

  private renderStage(
    rankings: FamilyRanking[],
    committees: Array<{ id: string; name: string }>,
  ) {
    const stageTitle = this.getStageTitle(rankings[0].stageName);
    const committeeHeaders = committees
      .map(
        (committee, index) => `
          <th class="committee-group tone-${index % 3}" colspan="2">
            ${this.escapeHtml(committee.name)}
          </th>`,
      )
      .join('');
    const committeeSubHeaders = committees
      .map(
        () => `
          <th class="sub-header">الدرجة</th>
          <th class="sub-header">وزنها %</th>`,
      )
      .join('');
    const rankingRows = rankings
      .sort(
        (first, second) =>
          first.rank - second.rank ||
          first.familyName.localeCompare(second.familyName),
      )
      .map((ranking) => {
        const breakdownByCommittee = new Map(
          ranking.committeeBreakdown.map((item) => [
            item.committeeId,
            item,
          ]),
        );
        const committeeCells = committees
          .map((committee) => {
            const breakdown = breakdownByCommittee.get(committee.id);

            return `
              <td>${this.formatScore(breakdown?.earnedScore ?? 0)}</td>
              <td class="weighted">${this.formatScore(breakdown?.weightedScore ?? 0)}</td>`;
          })
          .join('');

        return `
          <tr>
            <td>${ranking.rank}</td>
            <td class="family-name">${this.escapeHtml(ranking.familyName)}</td>
            <td>${this.formatScore(ranking.totalScore)}%</td>
            ${committeeCells}
            <td class="final-total">${this.formatScore(ranking.totalScore)}</td>
          </tr>`;
      })
      .join('');

    return `
      <section class="stage-section">
        <h2 class="stage-title">${this.escapeHtml(stageTitle)}</h2>
        <table>
          <thead>
            <tr>
              <th class="rank-column" rowspan="2">الترتيب</th>
              <th class="family-column" rowspan="2">الأسرة</th>
              <th class="percentage-column" rowspan="2">النسبة</th>
              ${committeeHeaders}
              <th class="total-column" rowspan="2">المجموع النهائي</th>
            </tr>
            <tr>${committeeSubHeaders}</tr>
          </thead>
          <tbody>${rankingRows}</tbody>
        </table>
      </section>`;
  }

  private getBrowserExecutablePath() {
    const candidates = [
      process.env.PUPPETEER_EXECUTABLE_PATH,
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ].filter((candidate): candidate is string => Boolean(candidate));
    const executablePath = candidates.find((candidate) =>
      existsSync(candidate),
    );

    if (!executablePath) {
      throw new InternalServerErrorException(
        'Chrome or Edge is required to generate PDF reports.',
      );
    }

    return executablePath;
  }

  private getStageTitle(stageName: string) {
    if (stageName.includes('متوسط')) {
      return 'المرحلة المتوسطة';
    }

    if (stageName.includes('ثانوي')) {
      return 'المرحلة الثانوية';
    }

    return stageName;
  }

  private getStageOrder(stageName: string) {
    if (stageName.includes('متوسط')) {
      return 1;
    }

    if (stageName.includes('ثانوي')) {
      return 2;
    }

    return 3;
  }

  private formatScore(value: number) {
    return Number(value.toFixed(2)).toString();
  }

  private formatReportDate(date: Date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();

    return `${day} / ${month} / ${year}`;
  }

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

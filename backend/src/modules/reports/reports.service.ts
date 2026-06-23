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
    const { default: puppeteer } = await import('puppeteer-core');
    const browser = await puppeteer.launch({
      executablePath: this.getBrowserExecutablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(
        this.buildDetailedResultsHtml(scoringCycle.name, rankings),
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
    scoringCycleName: string,
    rankings: FamilyRanking[],
  ) {
    const fontBase64 = readFileSync(ARABIC_FONT_PATH).toString('base64');
    const generatedAt = new Intl.DateTimeFormat('ar-SA', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
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
        ? stages.map((stage) => this.renderStage(stage)).join('')
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
      margin: 12mm;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      direction: rtl;
      color: #111827;
      background: #ffffff;
      font-family: "Noto Sans Arabic", Arial, sans-serif;
      font-size: 12px;
      line-height: 1.6;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-header {
      text-align: center;
      margin-bottom: 26px;
      border-bottom: 2px solid #18174A;
      padding-bottom: 16px;
    }
    .report-title {
      margin: 0;
      color: #18174A;
      font-size: 24px;
      font-weight: 700;
    }
    .report-meta {
      margin-top: 7px;
      color: #475569;
      font-size: 13px;
    }
    .notice {
      margin: 12px auto 0;
      max-width: 760px;
      padding: 8px 12px;
      color: #475569;
      background: #f8fafc;
      border: 1px solid #e2e8f0;
    }
    .stage-section {
      margin-top: 26px;
    }
    .stage-title {
      margin: 0 0 12px;
      padding: 10px 14px;
      color: #ffffff;
      background: #18174A;
      font-size: 20px;
      font-weight: 700;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: 12px;
    }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th {
      padding: 10px 8px;
      color: #ffffff;
      background: #18174A;
      border: 1px solid #d8deea;
      font-weight: 700;
      text-align: center;
    }
    td {
      padding: 10px 8px;
      border: 1px solid #d8deea;
      text-align: center;
      vertical-align: middle;
    }
    tbody tr:nth-child(even) td { background: #f8fafc; }
    .family-name { text-align: right; font-weight: 700; }
    .rank-column { width: 9%; }
    .family-column { width: 27%; }
    .week-column { width: 14%; }
    .total-column { width: 22%; }
    .details-heading {
      margin: 22px 0 10px;
      color: #18174A;
      font-size: 18px;
      font-weight: 700;
    }
    .family-details {
      margin: 0 0 16px;
      break-inside: avoid;
      page-break-inside: avoid;
    }
    .family-details-title {
      margin: 0;
      padding: 8px 12px;
      color: #18174A;
      background: #eef8fc;
      border: 1px solid #d8deea;
      border-bottom: 0;
      font-size: 14px;
      font-weight: 700;
    }
    .details-table th {
      padding: 8px;
      background: #334155;
    }
    .details-table td { padding: 8px; }
    .committee-name { text-align: right; font-weight: 600; }
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
    <h1 class="report-title">تقرير النتائج التفصيلي</h1>
    <div class="report-meta">دورة التقييم: ${this.escapeHtml(scoringCycleName)}</div>
    <div class="report-meta">تاريخ الإنشاء: ${this.escapeHtml(generatedAt)}</div>
    <div class="notice">بيانات الأسابيع غير متاحة في نموذج البيانات الحالي، لذلك تظهر بشرطة بدل إنشاء نتائج غير موجودة.</div>
  </header>
  ${content}
</body>
</html>`;
  }

  private renderStage(rankings: FamilyRanking[]) {
    const stageTitle = this.getStageTitle(rankings[0].stageName);
    const rankingRows = rankings
      .sort(
        (first, second) =>
          first.rank - second.rank ||
          first.familyName.localeCompare(second.familyName),
      )
      .map(
        (ranking) => `
          <tr>
            <td>${ranking.rank}</td>
            <td class="family-name">${this.escapeHtml(ranking.familyName)}</td>
            <td>—</td>
            <td>—</td>
            <td>—</td>
            <td><strong>${this.formatScore(ranking.totalScore)}</strong></td>
          </tr>`,
      )
      .join('');
    const details = rankings
      .map((ranking) => this.renderFamilyDetails(ranking))
      .join('');

    return `
      <section class="stage-section">
        <h2 class="stage-title">${this.escapeHtml(stageTitle)}</h2>
        <table>
          <thead>
            <tr>
              <th class="rank-column">الترتيب</th>
              <th class="family-column">الأسرة</th>
              <th class="week-column">الأسبوع الأول</th>
              <th class="week-column">الأسبوع الثاني</th>
              <th class="week-column">الأسبوع الثالث</th>
              <th class="total-column">المجموع النهائي</th>
            </tr>
          </thead>
          <tbody>${rankingRows}</tbody>
        </table>
        <h3 class="details-heading">تفاصيل اللجان</h3>
        ${details}
      </section>`;
  }

  private renderFamilyDetails(ranking: FamilyRanking) {
    const rows =
      ranking.committeeBreakdown.length > 0
        ? ranking.committeeBreakdown
            .map(
              (committee) => `
                <tr>
                  <td class="committee-name">${this.escapeHtml(committee.committeeName)}</td>
                  <td>—</td>
                  <td>—</td>
                  <td>—</td>
                  <td>${this.formatScore(committee.weightedScore)}</td>
                </tr>`,
            )
            .join('')
        : '<tr><td colspan="5">لا توجد درجات مسجلة</td></tr>';

    return `
      <div class="family-details">
        <h4 class="family-details-title">${this.escapeHtml(ranking.familyName)} - الترتيب ${ranking.rank}</h4>
        <table class="details-table">
          <thead>
            <tr>
              <th>اللجنة</th>
              <th>الأسبوع الأول</th>
              <th>الأسبوع الثاني</th>
              <th>الأسبوع الثالث</th>
              <th>المجموع</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
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

  private escapeHtml(value: string) {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }
}

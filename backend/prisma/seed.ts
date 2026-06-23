import { PrismaClient, ScoringCycleStatus, UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const adminName = process.env.SEED_ADMIN_NAME ?? 'System Admin';
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com';
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

const stageNames = ['متوسط', 'ثانوي'];

const familyNamesByStage: Record<string, string[]> = {
  متوسط: [
    'أسرة المتوسط 1',
    'أسرة المتوسط 2',
    'أسرة المتوسط 3',
    'أسرة المتوسط 4',
    'أسرة المتوسط 5',
    'أسرة المتوسط 6',
    'أسرة المتوسط 7',
    'أسرة المتوسط 8',
  ],
  ثانوي: [
    'أسرة الثانوي 1',
    'أسرة الثانوي 2',
    'أسرة الثانوي 3',
    'أسرة الثانوي 4',
    'أسرة الثانوي 5',
    'أسرة الثانوي 6',
  ],
};

const committees = [
  {
    name: 'الثقافية',
    weightPercentage: 20,
    criteria: [
      {
        title: 'الشعار',
        description: 'جودة شعار الأسرة وارتباطه بموضوع المركز',
        maxScore: 15,
      },
      {
        title: 'المسابقة الثقافية',
        description: 'مشاركة الأسرة ونتائجها في المسابقات الثقافية',
        maxScore: 25,
      },
      {
        title: 'الإلقاء والعرض',
        description: 'وضوح العرض وقوة الإلقاء والتفاعل',
        maxScore: 10,
      },
    ],
  },
  {
    name: 'الرياضية',
    weightPercentage: 20,
    criteria: [
      {
        title: 'المنافسات الجماعية',
        description: 'نتائج الأسرة في الألعاب الجماعية',
        maxScore: 30,
      },
      {
        title: 'المنافسات الفردية',
        description: 'نتائج الأسرة في الألعاب الفردية',
        maxScore: 20,
      },
      {
        title: 'الروح الرياضية',
        description: 'الالتزام بالأخلاق الرياضية واحترام المنافسين',
        maxScore: 10,
      },
    ],
  },
  {
    name: 'الدورات',
    weightPercentage: 20,
    criteria: [
      {
        title: 'الحضور',
        description: 'انتظام أفراد الأسرة في حضور الدورات',
        maxScore: 20,
      },
      {
        title: 'التفاعل',
        description: 'مشاركة أفراد الأسرة وتفاعلهم أثناء الدورة',
        maxScore: 20,
      },
      {
        title: 'التطبيق العملي',
        description: 'جودة تطبيق مخرجات الدورة',
        maxScore: 20,
      },
    ],
  },
  {
    name: 'البرامج الجماهيرية',
    weightPercentage: 20,
    criteria: [
      {
        title: 'الحضور الجماهيري',
        description: 'حضور الأسرة وتفاعلها في البرامج العامة',
        maxScore: 20,
      },
      {
        title: 'المشاركة',
        description: 'مبادرة الأسرة بالمشاركة والتنظيم',
        maxScore: 20,
      },
      {
        title: 'الإبداع',
        description: 'الأفكار الإبداعية في الفقرات والأنشطة',
        maxScore: 20,
      },
    ],
  },
  {
    name: 'النظام والمصلى',
    weightPercentage: 20,
    criteria: [
      {
        title: 'الانضباط العام',
        description: 'التزام الأسرة بالتعليمات والأنظمة',
        maxScore: 25,
      },
      {
        title: 'المصلى',
        description: 'المحافظة على حضور الصلاة وآداب المصلى',
        maxScore: 25,
      },
      {
        title: 'النظافة والترتيب',
        description: 'نظافة مقر الأسرة وترتيب الأدوات',
        maxScore: 10,
      },
    ],
  },
];

async function seedAdminUser() {
  if (!adminPassword) {
    throw new Error(
      'Missing SEED_ADMIN_PASSWORD. Add it to .env before running the seed.',
    );
  }

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      name: adminName,
      passwordHash,
      role: UserRole.ADMIN,
      committeeId: null,
    },
    create: {
      name: adminName,
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });
}

async function seedStagesAndFamilies() {
  for (const stageName of stageNames) {
    const stage = await prisma.stage.upsert({
      where: { name: stageName },
      update: {},
      create: { name: stageName },
    });

    for (const familyName of familyNamesByStage[stageName]) {
      await prisma.family.upsert({
        where: {
          stageId_name: {
            stageId: stage.id,
            name: familyName,
          },
        },
        update: {},
        create: {
          name: familyName,
          stageId: stage.id,
        },
      });
    }
  }
}

async function seedCommitteesAndCriteria() {
  for (const committeeSeed of committees) {
    const committee = await prisma.committee.upsert({
      where: { name: committeeSeed.name },
      update: {
        weightPercentage: committeeSeed.weightPercentage,
        isLocked: false,
      },
      create: {
        name: committeeSeed.name,
        weightPercentage: committeeSeed.weightPercentage,
      },
    });

    for (const [index, criterionSeed] of committeeSeed.criteria.entries()) {
      const existingCriterion = await prisma.criterion.findFirst({
        where: {
          committeeId: committee.id,
          title: criterionSeed.title,
        },
      });

      if (existingCriterion) {
        await prisma.criterion.update({
          where: { id: existingCriterion.id },
          data: {
            description: criterionSeed.description,
            maxScore: criterionSeed.maxScore,
            displayOrder: index + 1,
          },
        });
      } else {
        await prisma.criterion.create({
          data: {
            committeeId: committee.id,
            title: criterionSeed.title,
            description: criterionSeed.description,
            maxScore: criterionSeed.maxScore,
            displayOrder: index + 1,
          },
        });
      }
    }
  }
}

async function seedActiveScoringCycle() {
  const cycleName = 'دورة تجريبية';

  const scoringCycle = await prisma.scoringCycle.findFirst({
    where: { name: cycleName },
  });

  const activeCycle = scoringCycle
    ? await prisma.scoringCycle.update({
        where: { id: scoringCycle.id },
        data: {
          status: ScoringCycleStatus.ACTIVE,
          centerName: 'مركز تجريبي',
          eventName: 'منافسة تجريبية',
          periodLabel: 'الفترة الحالية',
        },
      })
    : await prisma.scoringCycle.create({
        data: {
          name: cycleName,
          centerName: 'مركز تجريبي',
          eventName: 'منافسة تجريبية',
          periodLabel: 'الفترة الحالية',
          status: ScoringCycleStatus.ACTIVE,
        },
      });

  await prisma.scoringCycle.updateMany({
    where: {
      status: ScoringCycleStatus.ACTIVE,
      id: { not: activeCycle.id },
    },
    data: { status: ScoringCycleStatus.DRAFT },
  });
}

async function main() {
  await seedAdminUser();
  await seedStagesAndFamilies();
  await seedCommitteesAndCriteria();
  await seedActiveScoringCycle();
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log('Seed completed successfully.');
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

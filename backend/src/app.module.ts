import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { StagesModule } from './modules/stages/stages.module';
import { FamiliesModule } from './modules/families/families.module';
import { CommitteesModule } from './modules/committees/committees.module';
import { CriteriaModule } from './modules/criteria/criteria.module';
import { ScoringCyclesModule } from './modules/scoring-cycles/scoring-cycles.module';
import { ScoresModule } from './modules/scores/scores.module';
import { RankingsModule } from './modules/rankings/rankings.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ArchivesModule } from './modules/archives/archives.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    StagesModule,
    FamiliesModule,
    CommitteesModule,
    CriteriaModule,
    ScoringCyclesModule,
    ScoresModule,
    RankingsModule,
    ReportsModule,
    ArchivesModule,
    AuditLogsModule,
  ],
})
export class AppModule {}

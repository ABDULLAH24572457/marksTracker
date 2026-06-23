import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { ScoringCyclesController } from './scoring-cycles.controller';
import { ScoringCyclesService } from './scoring-cycles.service';

@Module({
  imports: [ReportsModule],
  controllers: [ScoringCyclesController],
  providers: [ScoringCyclesService],
  exports: [ScoringCyclesService],
})
export class ScoringCyclesModule {}

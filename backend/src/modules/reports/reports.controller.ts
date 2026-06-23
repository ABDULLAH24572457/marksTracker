import {
  Controller,
  Get,
  Post,
  Res,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ReportsService } from './reports.service';

@Controller('reports')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('final-results')
  getFinalResults() {
    return this.reportsService.getFinalResults();
  }

  @Get('final-results/pdf')
  async downloadFinalResultsPdf(
    @Res({ passthrough: true }) response: Response,
  ) {
    const pdf = await this.reportsService.generateFinalResultsPdf();

    response.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition':
        'attachment; filename="detailed-results.pdf"',
      'Content-Length': pdf.length.toString(),
    });

    return new StreamableFile(pdf);
  }

  @Post('final-results/snapshot')
  createFinalResultsSnapshot(
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.reportsService.createFinalResultsSnapshot(user);
  }
}

import { Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { ScoringCyclesService } from './scoring-cycles.service';

@Controller('cycles')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
export class ScoringCyclesController {
  constructor(
    private readonly scoringCyclesService: ScoringCyclesService,
  ) {}

  @Post('archive-current')
  archiveCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.scoringCyclesService.archiveCurrent(user);
  }

  @Post('reset-current')
  resetCurrent(@CurrentUser() user: AuthenticatedUser) {
    return this.scoringCyclesService.resetCurrent(user);
  }
}

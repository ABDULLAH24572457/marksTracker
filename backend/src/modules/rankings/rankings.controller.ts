import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { RankingsService } from './rankings.service';

@Controller('rankings')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
export class RankingsController {
  constructor(private readonly rankingsService: RankingsService) {}

  @Get()
  findAll() {
    return this.rankingsService.findAll();
  }

  @Get('families/:familyId')
  findFamily(
    @Param('familyId', new ParseUUIDPipe()) familyId: string,
  ) {
    return this.rankingsService.findFamily(familyId);
  }
}

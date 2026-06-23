import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateScoreDto } from './dto/create-score.dto';
import { UpdateScoreDto } from './dto/update-score.dto';
import { ScoresService } from './scores.service';

@Controller('scores')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN, Role.DATA_ENTRY)
export class ScoresController {
  constructor(private readonly scoresService: ScoresService) {}

  @Post()
  create(
    @Body() createScoreDto: CreateScoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.create(createScoreDto, user);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.scoresService.findAll(user);
  }

  @Get(':id')
  findOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.findOne(id, user);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateScoreDto: UpdateScoreDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.update(id, updateScoreDto, user);
  }

  @Delete(':id')
  remove(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.scoresService.remove(id, user);
  }
}

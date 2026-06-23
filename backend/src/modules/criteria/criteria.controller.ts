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
import { Role, Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { JwtGuard } from '../auth/guards/jwt.guard';
import { CriteriaService } from './criteria.service';
import { CreateCriterionDto } from './dto/create-criterion.dto';
import { UpdateCriterionDto } from './dto/update-criterion.dto';

@Controller('criteria')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CriteriaController {
  constructor(private readonly criteriaService: CriteriaService) {}

  @Post()
  create(@Body() createCriterionDto: CreateCriterionDto) {
    return this.criteriaService.create(createCriterionDto);
  }

  @Get()
  findAll() {
    return this.criteriaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.criteriaService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCriterionDto: UpdateCriterionDto,
  ) {
    return this.criteriaService.update(id, updateCriterionDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.criteriaService.remove(id);
  }
}

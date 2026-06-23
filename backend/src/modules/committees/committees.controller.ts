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
import { CommitteesService } from './committees.service';
import { CreateCommitteeDto } from './dto/create-committee.dto';
import { UpdateCommitteeDto } from './dto/update-committee.dto';

@Controller('committees')
@UseGuards(JwtGuard, RolesGuard)
@Roles(Role.ADMIN)
export class CommitteesController {
  constructor(private readonly committeesService: CommitteesService) {}

  @Post()
  create(@Body() createCommitteeDto: CreateCommitteeDto) {
    return this.committeesService.create(createCommitteeDto);
  }

  @Get()
  findAll() {
    return this.committeesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.committeesService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() updateCommitteeDto: UpdateCommitteeDto,
  ) {
    return this.committeesService.update(id, updateCommitteeDto);
  }

  @Delete(':id')
  remove(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.committeesService.remove(id);
  }
}

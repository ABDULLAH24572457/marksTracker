import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class UpdateScoreDto {
  @IsOptional()
  @IsUUID()
  scoringCycleId?: string;

  @IsOptional()
  @IsUUID()
  familyId?: string;

  @IsOptional()
  @IsUUID()
  criterionId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  score?: number;
}

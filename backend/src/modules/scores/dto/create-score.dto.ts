import { Type } from 'class-transformer';
import { IsInt, IsUUID, Min } from 'class-validator';

export class CreateScoreDto {
  @IsUUID()
  scoringCycleId: string;

  @IsUUID()
  familyId: string;

  @IsUUID()
  criterionId: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  score: number;
}

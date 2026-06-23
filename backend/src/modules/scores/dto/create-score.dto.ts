import { Type } from 'class-transformer';
import { IsNumber, IsUUID, Min } from 'class-validator';

export class CreateScoreDto {
  @IsUUID()
  scoringCycleId: string;

  @IsUUID()
  familyId: string;

  @IsUUID()
  criterionId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score: number;
}

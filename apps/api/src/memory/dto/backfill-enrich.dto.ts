import { IsOptional, IsString } from 'class-validator';

export class BackfillEnrichDto {
  @IsOptional()
  @IsString()
  connectorType?: string;
}

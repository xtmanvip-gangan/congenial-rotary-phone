import { IsDateString } from 'class-validator'

export class RescheduleSessionDto {
  @IsDateString()
  scheduledStartAt!: string

  @IsDateString()
  scheduledEndAt!: string
}

import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class RejectAssignmentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string
}

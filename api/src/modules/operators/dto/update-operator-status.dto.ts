import { IsIn, IsString } from 'class-validator'

export class UpdateOperatorStatusDto {
  @IsString()
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled'
}

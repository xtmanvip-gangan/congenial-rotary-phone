import { IsIn } from 'class-validator'

export class UpdateStaffStatusDto {
  @IsIn(['active', 'disabled'])
  status!: 'active' | 'disabled'
}

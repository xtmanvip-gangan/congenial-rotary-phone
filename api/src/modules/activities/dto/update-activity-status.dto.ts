import { IsIn, IsString } from 'class-validator'

export class UpdateActivityStatusDto {
  @IsString()
  @IsIn(['draft', 'active', 'ended', 'disabled'])
  status!: 'draft' | 'active' | 'ended' | 'disabled'
}

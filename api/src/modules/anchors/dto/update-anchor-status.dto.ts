import { IsIn, IsString } from 'class-validator'

/** 档案经营状态：正常 / 断播 / 请假 / 退会 */
export class UpdateAnchorStatusDto {
  @IsString()
  @IsIn(['active', 'paused', 'leave', 'exited'])
  status!: 'active' | 'paused' | 'leave' | 'exited'
}

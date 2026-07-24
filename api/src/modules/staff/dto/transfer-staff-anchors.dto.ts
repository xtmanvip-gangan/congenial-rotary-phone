import { IsUUID } from 'class-validator'

export class TransferStaffAnchorsDto {
  @IsUUID()
  targetOperatorId!: string
}

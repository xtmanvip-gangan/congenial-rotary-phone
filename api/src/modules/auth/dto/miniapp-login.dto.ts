import { IsNotEmpty, IsString } from 'class-validator'

export class MiniappLoginDto {
  @IsString()
  @IsNotEmpty()
  code!: string
}

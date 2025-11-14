import { ApiProperty } from "@nestjs/swagger"
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator"

const PASSWORD_POLICY = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/

export class RegisterUserDto {
  @ApiProperty({ example: "Alex" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  firstName!: string

  @ApiProperty({ example: "Mercer", required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string

  @ApiProperty({ example: "alex@example.com" })
  @IsEmail()
  @MaxLength(255)
  email!: string

  @ApiProperty({ example: "Sup3rStrong!" })
  @IsString()
  @MinLength(8)
  @MaxLength(100)
  @Matches(PASSWORD_POLICY, {
    message:
      "Password must include an uppercase letter, a number, and a special character.",
  })
  password!: string

  @ApiProperty({ example: "toyota" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  brand!: string
}

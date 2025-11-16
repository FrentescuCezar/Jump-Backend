import { ApiProperty } from "@nestjs/swagger"

export class RegisteredUserDto {
  @ApiProperty({ example: "f1c22a77-6ea6-4f02-8a58-5d9d08f9d9c2" })
  id!: string

  @ApiProperty({ example: "2f4c1a9d-a36a-4ec9-8fc6-c35b0cc9c123" })
  keycloakId!: string

  @ApiProperty({ example: "alex@example.com" })
  email!: string

  @ApiProperty({ example: "Alex Mercer" })
  name!: string

  @ApiProperty()
  createdAt!: Date
}

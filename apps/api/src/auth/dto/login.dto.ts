import { IsEmail, IsNotEmpty, IsString } from "class-validator";

export class LoginDto {
  @IsEmail()
  email!: string;

  // Deliberately NOT @MinLength(8): rejecting short passwords before the
  // bcrypt compare would leak the password-policy and reveal that the email
  // exists. Any non-empty string is accepted, then compared.
  @IsString()
  @IsNotEmpty()
  password!: string;
}

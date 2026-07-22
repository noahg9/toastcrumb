import {
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from "class-validator";

function MaxByteLength(max: number, options?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      name: "maxByteLength",
      target: object.constructor,
      propertyName,
      constraints: [max],
      options,
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== "string") return false;
          return Buffer.byteLength(value, "utf8") <= (args.constraints[0] as number);
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} must not exceed ${args.constraints[0] as number} bytes`;
        },
      },
    });
  };
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  // bcrypt silently truncates beyond 72 bytes — guard on bytes, not characters,
  // so multi-byte (CJK, emoji) passwords are correctly bounded.
  @IsString()
  @MinLength(8)
  @MaxByteLength(72)
  password!: string;

  @IsOptional()
  @IsString()
  name?: string;
}

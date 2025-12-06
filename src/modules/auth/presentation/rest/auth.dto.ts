import { ApiProperty } from '@nestjs/swagger';

export class LoginBody {
  @ApiProperty({ example: 'admin@example.com' })
  email!: string;
  @ApiProperty({ example: 'admin123' })
  password!: string;
}

export class RefreshTokenBody {
  @ApiProperty({ example: 'b3b9b1e9e9c64f8892e4f1a0b0d2b8f7' })
  refreshToken!: string;
}

export class RequestPasswordResetBody {
  @ApiProperty({ example: 'user@example.com' })
  email!: string;
}

export class ConfirmPasswordResetBody {
  @ApiProperty({ example: 'reset-token-hex-string' })
  token!: string;
  @ApiProperty({ example: 'newStrongPassword123' })
  newPassword!: string;
}

export class RegisterBody {
  @ApiProperty({ example: 'John Doe' })
  name!: string;
  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;
  @ApiProperty({ example: 'password123' })
  password!: string;
  @ApiProperty({ example: '1990-05-20' })
  birthDate!: Date;
}

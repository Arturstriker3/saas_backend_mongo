export class LoginBody {
  email!: string;
  password!: string;
}

export class RefreshTokenBody {
  refreshToken!: string;
}

export class RequestPasswordResetBody {
  email!: string;
}

export class ConfirmPasswordResetBody {
  token!: string;
  newPassword!: string;
}


import { Role } from '../../../role/domain/role.types';

export class CreateUserBody {
  name!: string;
  email!: string;
  password!: string;
  birthDate!: Date;
  role!: Role;
  credits!: number;
}

export class ChangeUserNameBody {
  name!: string;
}

export class ChangeUserPasswordBody {
  newPassword!: string;
}

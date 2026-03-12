import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { loadEnv } from '../../../common/config/env';
import type { UserRepository } from '../../user/domain/user.repository.interface';
import { UserRepositoryMongo } from '../../user/infrastructure/user.repository.mongo';
import type { Role } from '../../role/domain/role.types';
import { isInactiveUserBlocked } from '../domain/user-access.policy';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(UserRepositoryMongo) private readonly users: UserRepository) {
    const env = loadEnv();
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: { sub: string; role?: Role }) {
    const user = await this.users.findById(payload.sub);
    if (!user) throw new UnauthorizedException('Invalid token user');
    if (isInactiveUserBlocked(user)) throw new ForbiddenException('User account is deactivated');
    return { userId: user.uuid, role: user.role as Role };
  }
}

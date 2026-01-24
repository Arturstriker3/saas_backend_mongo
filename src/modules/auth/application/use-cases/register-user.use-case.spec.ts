import { ConflictException } from '@nestjs/common';
import { RegisterUserUseCase } from './register-user.use-case';
import type { UserRepository } from '../../../user/domain/user.repository.interface';
import type { PasswordHasher } from '../../domain/password-hasher.interface';
import type { EventBus } from '../../../../common/messaging/event-bus.interface';
import type { UserEntity } from '../../../user/domain/user.entity';

type TestDeps = {
  users: UserRepository;
  hasher: PasswordHasher;
  events: EventBus;
};

function createDeps(): TestDeps {
  return {
    users: {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      save: jest.fn(),
    },
    hasher: {
      hash: jest.fn(),
      compare: jest.fn(),
    },
    events: {
      publish: jest.fn(),
    },
  };
}

describe('RegisterUserUseCase', () => {
  it('creates user and publishes event', async () => {
    const deps = createDeps();
    const useCase = new RegisterUserUseCase(deps.users, deps.hasher, deps.events);
    const input = {
      name: 'John Doe',
      email: 'John.Doe@Example.com',
      password: 'password123',
    };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const entity = {
      uuid: 'user-uuid',
      name: input.name,
      email: input.email,
      passwordHash: 'hashed',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: 0,
    } as UserEntity;
    (deps.users.findByEmail as jest.Mock).mockResolvedValue(null);
    (deps.hasher.hash as jest.Mock).mockResolvedValue('hashed');
    (deps.users.create as jest.Mock).mockResolvedValue(entity);

    const result = await useCase.execute(input);

    expect(deps.users.findByEmail).toHaveBeenCalledWith('john.doe@example.com');
    expect(deps.hasher.hash).toHaveBeenCalledWith(input.password);
    expect(deps.users.create).toHaveBeenCalledWith({
      name: input.name,
      email: input.email,
      passwordHash: 'hashed',
      role: 'USER',
      credits: 0,
    });
    expect(deps.events.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'UserRegistered',
        payload: {
          userId: entity.uuid,
          email: entity.email,
          name: entity.name,
        },
        occurredAt: expect.any(Date),
      }),
    );
    expect(result).toEqual({
      uuid: entity.uuid,
      name: entity.name,
      email: entity.email,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      isActive: entity.isActive,
      role: entity.role,
      credits: entity.credits,
    });
  });

  it('throws when email already exists', async () => {
    const deps = createDeps();
    const useCase = new RegisterUserUseCase(deps.users, deps.hasher, deps.events);
    const input = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password: 'password123',
    };
    (deps.users.findByEmail as jest.Mock).mockResolvedValue({ uuid: 'existing' });

    await expect(useCase.execute(input)).rejects.toBeInstanceOf(ConflictException);

    expect(deps.users.create).not.toHaveBeenCalled();
    expect(deps.events.publish).not.toHaveBeenCalled();
  });
});

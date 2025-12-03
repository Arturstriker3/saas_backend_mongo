import { UserRepository } from '../../domain/user.repository';
import { UserEntity } from '../../domain/user.entity';

export class ListUsersUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(): Promise<UserEntity[]> {
    return this.repo.findAll();
  }
}

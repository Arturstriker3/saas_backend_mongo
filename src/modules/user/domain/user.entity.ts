import {
  USER_NAME_MIN_LENGTH,
  USER_PASSWORD_HASH_MIN_LENGTH,
} from "./user.constants";

export class UserEntity {
  private static readonly NAME_MIN_LENGTH = USER_NAME_MIN_LENGTH;
  private static readonly PASSWORD_HASH_MIN_LENGTH =
    USER_PASSWORD_HASH_MIN_LENGTH;

  public readonly id: string;
  public readonly createdAt: Date;
  public readonly birthDate: Date;

  private _name: string;
  private _email: string;
  private _passwordHash: string;
  private _isActive: boolean;
  private _updatedAt: Date;
  private _role: string;

  constructor(props: {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
    birthDate: Date;
    role: string;
    createdAt?: Date;
    updatedAt?: Date;
    isActive?: boolean;
  }) {
    if (!props.id) throw new Error("User ID is required");
    if (!props.email.includes("@")) throw new Error("Invalid email");
    if (!props.name || props.name.length < UserEntity.NAME_MIN_LENGTH)
      throw new Error(
        `Name must have at least ${UserEntity.NAME_MIN_LENGTH} characters`
      );
    if (
      !props.passwordHash ||
      props.passwordHash.length < UserEntity.PASSWORD_HASH_MIN_LENGTH
    )
      throw new Error("Invalid password hash");

    this.id = props.id;
    this._name = props.name;
    this._email = props.email.toLowerCase();
    this._passwordHash = props.passwordHash;
    this.birthDate = props.birthDate;
    this._role = props.role;
    this.createdAt = props.createdAt ?? new Date();
    this._updatedAt = props.updatedAt ?? new Date();
    this._isActive = props.isActive ?? false;
  }

  activate() {
    if (this._isActive) return;
    this._isActive = true;
    this.touch();
  }

  deactivate() {
    if (!this._isActive) return;
    this._isActive = false;
    this.touch();
  }

  changePassword(newHash: string) {
    if (!newHash || newHash.length < UserEntity.PASSWORD_HASH_MIN_LENGTH)
      throw new Error("Invalid password hash");
    this._passwordHash = newHash;
    this.touch();
  }

  changeName(newName: string) {
    if (!newName || newName.length < UserEntity.NAME_MIN_LENGTH)
      throw new Error(
        `Name must have at least ${UserEntity.NAME_MIN_LENGTH} characters`
      );
    this._name = newName;
    this.touch();
  }

  private touch() {
    this._updatedAt = new Date();
  }

  get name() {
    return this._name;
  }

  get email() {
    return this._email;
  }

  get passwordHash() {
    return this._passwordHash;
  }

  get isActive() {
    return this._isActive;
  }

  get updatedAt() {
    return this._updatedAt;
  }

  get role() {
    return this._role;
  }
}


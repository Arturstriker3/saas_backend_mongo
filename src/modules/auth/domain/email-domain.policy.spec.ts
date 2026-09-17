import { describe, it, expect } from 'bun:test';
import { extractEmailDomain, isDisposableEmailDomain } from './email-domain.policy';

describe('extractEmailDomain', () => {
  it('returns normalized domain', () => {
    expect(extractEmailDomain('John.Doe@Example.COM')).toBe('example.com');
  });

  it('returns null when email has no domain', () => {
    expect(extractEmailDomain('john.doe')).toBeNull();
    expect(extractEmailDomain('john.doe@')).toBeNull();
  });
});

describe('isDisposableEmailDomain', () => {
  it('blocks known disposable domain', () => {
    expect(isDisposableEmailDomain('john.doe@mailinator.com')).toBe(true);
    expect(isDisposableEmailDomain('john.doe@yopmail.com')).toBe(true);
  });

  it('blocks disposable domain subdomain', () => {
    expect(isDisposableEmailDomain('john.doe@inbox.mailinator.com')).toBe(true);
  });

  it('blocks disposable domain regardless of letter case', () => {
    expect(isDisposableEmailDomain('JOHN.DOE@MAILINATOR.COM')).toBe(true);
  });

  it('allows mailbox providers and corporate domains', () => {
    expect(isDisposableEmailDomain('john.doe@gmail.com')).toBe(false);
    expect(isDisposableEmailDomain('john.doe@outlook.com')).toBe(false);
    expect(isDisposableEmailDomain('john.doe@proton.me')).toBe(false);
    expect(isDisposableEmailDomain('john.doe@acme.com.br')).toBe(false);
  });

  it('does not block when the disposable domain appears as a subdomain label', () => {
    expect(isDisposableEmailDomain('john.doe@mailinator.com.evil.com')).toBe(false);
  });

  it('blocks domains listed by the reference list', () => {
    expect(isDisposableEmailDomain('john.doe@sharklasers.com')).toBe(true);
    expect(isDisposableEmailDomain('john.doe@tempr.email')).toBe(true);
  });

  it('returns false when email has no domain', () => {
    expect(isDisposableEmailDomain('john.doe')).toBe(false);
  });
});

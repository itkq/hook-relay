export interface IAuthenticator {
  authenticate(query: URLSearchParams): boolean;
}

class FixedTokenAuthenticator implements IAuthenticator {
  private validToken: string;

  constructor(options: { validToken?: string }) {
    this.validToken = options.validToken || '';
  }

  authenticate(query: URLSearchParams): boolean {
    const token = query.get('token');
    return token === this.validToken;
  }
}

type AuthenticatorKind = 'fixed-token';

type AuthenticatorMap = {
  [key in AuthenticatorKind]: new (options: any) => IAuthenticator;
};

const authenticators: AuthenticatorMap = {
  "fixed-token": FixedTokenAuthenticator,
};

export function getAuthenticator(name: AuthenticatorKind, options: any): IAuthenticator {
  const AuthenticatorClass = authenticators[name];
  if (!AuthenticatorClass) {
    return new FixedTokenAuthenticator(options); // default
  }
  return new AuthenticatorClass(options);
}

import { Request } from 'express';
export interface IAuthenticator {
  authenticate(req: Request): boolean
}

class BearerTokenAuthenticator implements IAuthenticator {
  private token: string;

  constructor(options: { token: string }) {
    this.token = options.token;
  }

  authenticate(req: Request): boolean {
    const token = req.headers.authorization?.replace('Bearer ', '').trim();
    return token === this.token;
  }
}

type AuthenticatorKind = 'bearer-token';

type AuthenticatorMap = {
  [key in AuthenticatorKind]: new (options: any) => IAuthenticator;
};

const authenticators: AuthenticatorMap = {
  "bearer-token": BearerTokenAuthenticator,
};

export function getAuthenticator(name: AuthenticatorKind, options: any): IAuthenticator {
  const AuthenticatorClass = authenticators[name];
  if (!AuthenticatorClass) {
    return new BearerTokenAuthenticator(options); // default
  }
  return new AuthenticatorClass(options);
}

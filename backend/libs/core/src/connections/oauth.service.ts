import { Injectable, BadRequestException } from '@nestjs/common';
import { OAuthConfig } from '../common/interfaces';

export interface AuthorizationUrlOptions {
  clientId: string;
  redirectUri: string;
  state: string;
  scopes?: string[];
  additionalParams?: Record<string, string>;
}

@Injectable()
export class OAuthService {
  /**
   * Generates standard OAuth 2.0 authorization URL.
   */
  buildAuthorizationUrl(
    config: OAuthConfig,
    options: AuthorizationUrlOptions,
  ): string {
    const url = new URL(config.authorizationUrl);
    url.searchParams.set('client_id', options.clientId);
    url.searchParams.set('redirect_uri', options.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', options.state);

    const scopes = options.scopes && options.scopes.length > 0
      ? options.scopes
      : config.scopes;

    if (scopes.length > 0) {
      url.searchParams.set('scope', scopes.join(' '));
    }

    if (options.additionalParams) {
      for (const [key, value] of Object.entries(options.additionalParams)) {
        url.searchParams.set(key, value);
      }
    }

    return url.toString();
  }

  /**
   * Standard OAuth 2.0 token exchange helper.
   */
  async exchangeCodeForToken(params: {
    tokenUrl: string;
    code: string;
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    headers?: Record<string, string>;
  }): Promise<any> {
    try {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: params.code,
        client_id: params.clientId,
        client_secret: params.clientSecret,
        redirect_uri: params.redirectUri,
      });

      const response = await fetch(params.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          ...(params.headers || {}),
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed (${response.status}): ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw new BadRequestException(`OAuth token exchange error: ${error.message}`);
    }
  }
}


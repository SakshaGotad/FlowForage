import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../storage/prisma.service';
import * as bcrypt from 'bcrypt';

export class RegisterUserDto {
  email: string;
  password: string;
  name?: string;
}

export interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
  authProvider: string;
  createdAt: Date;
}

export interface GoogleUserProfile {
  email: string;
  name?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterUserDto): Promise<UserSummary> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException(`User with email ${dto.email} already exists`);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        authProvider: 'local',
      },
    });

    return this.toSummary(user);
  }

  async validateUser(email: string, password: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account was created using Google Sign-In. Please sign in with Google.',
      );
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.toSummary(user);
  }

  async getUserById(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return this.toSummary(user);
  }

  /**
   * Generates the Google OAuth 2.0 authorization URL for 1-click Sign-in.
   */
  getGoogleAuthorizationUrl(redirectUri?: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new BadRequestException('GOOGLE_CLIENT_ID is not configured in .env');
    }

    const callbackUrl =
      redirectUri ||
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/google/callback';

    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');

    return url.toString();
  }

  /**
   * Handles Google OAuth callback: exchanges code, fetches profile, creates/finds user.
   */
  async handleGoogleCallback(
    code: string,
    redirectUri?: string,
  ): Promise<UserSummary> {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new BadRequestException('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured');
    }

    const callbackUrl =
      redirectUri ||
      process.env.GOOGLE_CALLBACK_URL ||
      'http://localhost:3000/auth/google/callback';

    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new UnauthorizedException(
        `Google token exchange failed: ${tokenData.error_description || tokenData.error}`,
      );
    }

    // 2. Fetch user profile from Google UserInfo API
    const userinfoResponse = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoResponse.ok) {
      throw new UnauthorizedException('Failed to fetch user profile from Google');
    }

    const googleUser = await userinfoResponse.json();

    return this.validateOrCreateGoogleUser({
      email: googleUser.email,
      name: googleUser.name,
      avatarUrl: googleUser.picture,
    });
  }

  /**
   * Creates or matches a user authenticated via Google.
   */
  async validateOrCreateGoogleUser(
    profile: GoogleUserProfile,
  ): Promise<UserSummary> {
    const email = profile.email.toLowerCase();

    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // First-time Google user: auto-create user record
      user = await this.prisma.user.create({
        data: {
          email,
          name: profile.name || null,
          avatarUrl: profile.avatarUrl || null,
          authProvider: 'google',
        },
      });
    } else {
      // Update existing profile details if changed
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          name: profile.name || user.name,
          avatarUrl: profile.avatarUrl || user.avatarUrl,
        },
      });
    }

    return this.toSummary(user);
  }

  private toSummary(user: any): UserSummary {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
      authProvider: user.authProvider || 'local',
      createdAt: user.createdAt,
    };
  }
}

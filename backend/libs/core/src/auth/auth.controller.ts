import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { AuthService, RegisterUserDto } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Standard Email & Password Registration.
   */
  @Post('register')
  async register(@Body() body: RegisterUserDto) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.authService.register(body);
    return {
      success: true,
      user,
      message: 'Account created successfully',
    };
  }

  /**
   * Standard Email & Password Login.
   */
  @Post('login')
  async login(@Body() body: { email?: string; password?: string }) {
    if (!body.email || !body.password) {
      throw new BadRequestException('Email and password are required');
    }
    const user = await this.authService.validateUser(body.email, body.password);
    return {
      success: true,
      user,
      message: 'Login successful',
    };
  }

  /**
   * Fetch currently logged-in user profile.
   */
  @Get('me')
  async getProfile(@Headers('x-user-id') userId: string) {
    if (!userId) {
      throw new BadRequestException("Header 'x-user-id' is required");
    }
    const user = await this.authService.getUserById(userId);
    return { success: true, user };
  }

  /**
   * Google OAuth 2.0: Initiate Sign-in with Google.
   * Returns authorization URL or redirects.
   */
  @Get('google')
  async signInWithGoogle(
    @Query('redirect') redirectMode: string,
    @Res() res: any,
  ) {
    const url = this.authService.getGoogleAuthorizationUrl();

    // If client requested redirect, redirect browser directly to Google
    if (redirectMode === 'true') {
      return res.redirect(url);
    }

    return res.json({ success: true, authorizationUrl: url });
  }

  /**
   * Google OAuth 2.0: Callback endpoint.
   * Google redirects back here with ?code=...
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Res() res: any,
  ) {
    if (!code) {
      throw new BadRequestException('Missing authorization code from Google');
    }

    const user = await this.authService.handleGoogleCallback(code);

    // If APP_BASE_URL / frontend URL is configured, redirect back to frontend with user info
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3001';
    const redirectTarget = `${frontendUrl}/auth/callback?userId=${user.id}&email=${encodeURIComponent(user.email)}&name=${encodeURIComponent(user.name || '')}`;

    // Return JSON or redirect to frontend
    if (process.env.FRONTEND_URL) {
      return res.redirect(redirectTarget);
    }

    return res.json({
      success: true,
      user,
      message: 'Google authentication successful',
    });
  }
}

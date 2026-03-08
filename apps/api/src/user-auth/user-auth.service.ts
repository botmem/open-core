import {
  Injectable,
  BadRequestException,
  ConflictException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { UsersService } from './users.service';
import { ConfigService } from '../config/config.service';

// Dummy hash used for timing attack prevention when user not found
const DUMMY_HASH = '$2b$12$LJ3m4ys3Gz8h/.0MStlQiee6RjGHPnRYVwO3BSXK8X8A.VFj0e6Vu';

@Injectable()
export class UserAuthService {
  constructor(
    private jwt: JwtService,
    private usersService: UsersService,
    private config: ConfigService,
  ) {}

  async register(email: string, password: string, name: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 8 characters long',
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    let user: any;
    try {
      user = await this.usersService.createUser(email, passwordHash, name);
    } catch (err: any) {
      // SQLite unique constraint error
      if (
        err?.message?.includes('UNIQUE constraint failed') ||
        err?.code === 'SQLITE_CONSTRAINT_UNIQUE'
      ) {
        throw new ConflictException('Email already registered');
      }
      throw err;
    }

    const tokens = await this.generateTokenPair(user!.id, user!.email);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user!),
    };
  }

  async login(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);

    // Always run bcrypt.compare to prevent timing attacks
    const hashToCompare = user?.passwordHash ?? DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCompare);

    if (!user || !valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokenPair(user.id, user.email);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(oldRefreshToken: string) {
    // Verify the refresh JWT
    let payload: any;
    try {
      payload = this.jwt.verify(oldRefreshToken, {
        secret: this.config.jwtRefreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Look up by token hash
    const tokenHash = this.hashToken(oldRefreshToken);
    const stored = await this.usersService.findRefreshToken(tokenHash);

    if (!stored) {
      throw new UnauthorizedException('Refresh token not found');
    }

    // Replay detection: if token was already revoked, kill entire family
    if (stored.revokedAt) {
      await this.usersService.revokeTokenFamily(stored.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    // Check expiration
    if (new Date(stored.expiresAt) < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Revoke the old token
    await this.usersService.revokeRefreshToken(stored.id);

    // Generate new token pair with the same family
    const tokens = await this.generateTokenPair(
      payload.sub,
      payload.email,
      stored.family,
    );

    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }

  async logout(refreshToken: string) {
    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.usersService.findRefreshToken(tokenHash);
    if (stored) {
      await this.usersService.revokeRefreshToken(stored.id);
    }
  }

  private async generateTokenPair(
    userId: string,
    email: string,
    family?: string,
  ) {
    const tokenFamily = family ?? randomUUID();

    // Sign access token (15min)
    const accessToken = this.jwt.sign(
      { sub: userId, email },
      {
        secret: this.config.jwtAccessSecret,
        expiresIn: this.config.jwtAccessExpiresIn as any,
        algorithm: 'HS256',
      },
    );

    // Generate refresh token: random bytes signed as JWT
    const refreshPayload = {
      sub: userId,
      email,
      jti: randomBytes(32).toString('hex'),
    };
    const refreshToken = this.jwt.sign(refreshPayload, {
      secret: this.config.jwtRefreshSecret,
      expiresIn: this.config.jwtRefreshExpiresIn as any,
      algorithm: 'HS256',
    });

    // Store hash of refresh token in DB
    const tokenHash = this.hashToken(refreshToken);
    const expiresAt = new Date(
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    await this.usersService.saveRefreshToken(
      userId,
      tokenHash,
      tokenFamily,
      expiresAt,
    );

    return { accessToken, refreshToken };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: any) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      onboarded: !!user.onboarded,
      createdAt: user.createdAt,
    };
  }
}

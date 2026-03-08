import { Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { DbService } from '../db/db.service';
import { users, refreshTokens } from '../db/schema';

@Injectable()
export class UsersService {
  constructor(private db: DbService) {}

  async createUser(email: string, passwordHash: string, name: string) {
    const now = new Date().toISOString();
    const id = randomUUID();
    await this.db.db.insert(users).values({
      id,
      email: email.toLowerCase().trim(),
      passwordHash,
      name,
      onboarded: 0,
      createdAt: now,
      updatedAt: now,
    });
    return this.findById(id);
  }

  async findByEmail(email: string) {
    const rows = await this.db.db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);
    return rows[0] ?? null;
  }

  async findById(id: string) {
    const rows = await this.db.db
      .select()
      .from(users)
      .where(eq(users.id, id))
      .limit(1);
    return rows[0] ?? null;
  }

  async saveRefreshToken(
    userId: string,
    tokenHash: string,
    family: string,
    expiresAt: string,
  ) {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db.db.insert(refreshTokens).values({
      id,
      userId,
      tokenHash,
      family,
      expiresAt,
      createdAt: now,
    });
    return { id, userId, tokenHash, family, expiresAt, createdAt: now };
  }

  async findRefreshToken(tokenHash: string) {
    const rows = await this.db.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ?? null;
  }

  async revokeRefreshToken(id: string) {
    const now = new Date().toISOString();
    await this.db.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.id, id));
  }

  async revokeTokenFamily(family: string) {
    const now = new Date().toISOString();
    await this.db.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.family, family));
  }

  async revokeAllUserTokens(userId: string) {
    const now = new Date().toISOString();
    await this.db.db
      .update(refreshTokens)
      .set({ revokedAt: now })
      .where(eq(refreshTokens.userId, userId));
  }
}

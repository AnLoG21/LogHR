import { HttpException, HttpStatus, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

type Attempt = { count: number; resetAt: number; lockedUntil?: number };

@Injectable()
export class LoginRateLimitService implements OnModuleInit {
  private readonly logger = new Logger(LoginRateLimitService.name);
  private redis: IORedis | null = null;
  private memory = new Map<string, Attempt>();

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get<string>('REDIS_URL') || 'redis://localhost:6379';
    try {
      const client = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true, connectTimeout: 2000 });
      await client.connect();
      this.redis = client;
      this.logger.log('Login rate-limit: Redis');
    } catch (e: any) {
      this.logger.warn(`Login rate-limit: in-memory fallback (${e?.message || e})`);
      this.redis = null;
    }
  }

  key(email: string, ip?: string) {
    return `login:rl:${(ip || 'unknown').slice(0, 64)}:${email.toLowerCase()}`;
  }

  private ttlMs(row: Attempt, now: number) {
    const until = Math.max(row.resetAt, row.lockedUntil || 0);
    return Math.max(1000, until - now + 5000);
  }

  private async load(key: string, now: number): Promise<Attempt | null> {
    if (this.redis) {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      try {
        const row = JSON.parse(raw) as Attempt;
        if (row.resetAt < now && !(row.lockedUntil && row.lockedUntil > now)) {
          await this.redis.del(key);
          return null;
        }
        return row;
      } catch {
        await this.redis.del(key);
        return null;
      }
    }
    const row = this.memory.get(key);
    if (!row) return null;
    if (row.resetAt < now && !(row.lockedUntil && row.lockedUntil > now)) {
      this.memory.delete(key);
      return null;
    }
    return row;
  }

  private async save(key: string, row: Attempt, now: number) {
    const px = this.ttlMs(row, now);
    if (this.redis) {
      await this.redis.set(key, JSON.stringify(row), 'PX', px);
    } else {
      this.memory.set(key, row);
    }
  }

  private async remove(key: string) {
    if (this.redis) await this.redis.del(key);
    else this.memory.delete(key);
  }

  async assertAllowed(email: string, ip?: string) {
    const key = this.key(email, ip);
    const now = Date.now();
    const row = await this.load(key, now);
    if (row?.lockedUntil && row.lockedUntil > now) {
      const sec = Math.ceil((row.lockedUntil - now) / 1000);
      throw new HttpException(`Слишком много попыток входа. Повторите через ${sec} с.`, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  async recordFailure(email: string, ip?: string) {
    const key = this.key(email, ip);
    const now = Date.now();
    const max = Number(process.env.LOGIN_MAX_ATTEMPTS || 8);
    const windowMs = Number(process.env.LOGIN_WINDOW_MS || 15 * 60 * 1000);
    const lockMs = Number(process.env.LOGIN_LOCK_MS || 15 * 60 * 1000);
    const prev = await this.load(key, now);
    const base = prev && prev.resetAt > now ? prev : { count: 0, resetAt: now + windowMs };
    const count = base.count + 1;
    const next: Attempt = { count, resetAt: base.resetAt };
    if (count >= max) next.lockedUntil = now + lockMs;
    await this.save(key, next, now);
  }

  async clear(email: string, ip?: string) {
    await this.remove(this.key(email, ip));
  }
}

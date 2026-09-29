import { Global, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleInit {
  private readonly logger = new Logger(QueueService.name);
  private connection: IORedis | null = null;
  notifications: Queue | null = null;
  jobBoards: Queue | null = null;
  available = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    const url = this.config.get('REDIS_URL') || 'redis://localhost:6379';
    try {
      this.connection = new IORedis(url, { maxRetriesPerRequest: null, lazyConnect: true, connectTimeout: 2000 });
      await this.connection.connect();
      this.notifications = new Queue('notifications', { connection: this.connection });
      this.jobBoards = new Queue('job-boards', { connection: this.connection });
      this.available = true;
      this.logger.log('Redis/BullMQ connected');
    } catch (e: any) {
      this.logger.warn(`Redis unavailable (${e.message}) — queues run inline`);
      this.available = false;
      if (this.connection) {
        try { this.connection.disconnect(); } catch { /* ignore */ }
      }
      this.connection = null;
    }
  }

  async enqueueNotification(name: string, data: Record<string, unknown>) {
    if (this.available && this.notifications) {
      await this.notifications.add(name, data);
      return { queued: true };
    }
    this.logger.log(`[inline notification] ${name} ${JSON.stringify(data)}`);
    return { queued: false, inline: true };
  }
}

@Global()
@Module({ providers: [QueueService], exports: [QueueService] })
export class QueueModule {}

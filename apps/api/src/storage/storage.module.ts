import { Global, Injectable, Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { createHash, randomUUID } from 'crypto';
import { signS3Put } from '../job-boards/adapters';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private localDir = path.join(process.cwd(), 'uploads');
  private useLocal = true;

  constructor(private config: ConfigService) {}

  onModuleInit() {
    const endpoint = this.config.get('S3_ENDPOINT');
    this.useLocal = process.env.STORAGE_MODE !== 's3' || !endpoint;
    if (this.useLocal) {
      fs.mkdirSync(this.localDir, { recursive: true });
      this.logger.log(`Storage: local directory ${this.localDir}`);
    } else {
      this.logger.log(`Storage: S3/MinIO signed ${endpoint}`);
    }
  }

  async upload(buffer: Buffer, fileName: string, mimeType?: string): Promise<{ url: string; key: string }> {
    const key = `${Date.now()}-${randomUUID()}-${fileName.replace(/[^\w.\-]+/g, '_')}`;
    if (this.useLocal) {
      const full = path.join(this.localDir, key);
      fs.writeFileSync(full, buffer);
      return { url: `/uploads/${key}`, key };
    }

    const endpoint = this.config.get<string>('S3_ENDPOINT')!;
    const bucket = this.config.get('S3_BUCKET') || 'skillaz';
    const accessKey = this.config.get('S3_ACCESS_KEY') || 'minioadmin';
    const secretKey = this.config.get('S3_SECRET_KEY') || 'minioadmin';
    const region = this.config.get('S3_REGION') || 'us-east-1';
    const url = `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
    const contentType = mimeType || 'application/octet-stream';
    const bodyHash = createHash('sha256').update(buffer).digest('hex');
    const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const headers = signS3Put({
      method: 'PUT',
      url,
      accessKey,
      secretKey,
      region,
      contentType,
      bodyHash,
      amzDate,
    });

    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers,
        body: new Uint8Array(buffer),
      });
      if (!res.ok) throw new Error(`S3 ${res.status}`);
      return { url, key };
    } catch (e: any) {
      this.logger.warn(`S3 upload failed, falling back to local: ${e.message}`);
      fs.mkdirSync(this.localDir, { recursive: true });
      const full = path.join(this.localDir, key);
      fs.writeFileSync(full, buffer);
      return { url: `/uploads/${key}`, key };
    }
  }
}

@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}

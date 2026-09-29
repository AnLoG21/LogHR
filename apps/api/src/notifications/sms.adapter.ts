import { Injectable } from '@nestjs/common';

export interface SmsPort {
  send(to: string, text: string): Promise<{ ok: boolean; id?: string; error?: string }>;
}

class MockSmsAdapter implements SmsPort {
  async send(to: string, text: string) {
    console.log(`[SMS mock] to=${to} text=${text.slice(0, 80)}`);
    return { ok: true, id: `sms-mock-${Date.now()}` };
  }
}

class RapportoSmsAdapter implements SmsPort {
  constructor(private apiKey: string, private endpoint: string) {}

  async send(to: string, text: string) {
    try {
      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({ phone: to, text }),
      });
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status}` };
      }
      const data: any = await res.json().catch(() => ({}));
      return { ok: true, id: String(data.id || data.message_id || Date.now()) };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}

export function createSmsAdapter(): SmsPort {
  const key = process.env.SMS_API_KEY;
  const endpoint = process.env.SMS_API_URL || 'https://api.rapporto.example/sms';
  if (!key) return new MockSmsAdapter();
  return new RapportoSmsAdapter(key, endpoint);
}

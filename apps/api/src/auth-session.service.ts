import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { randomUUID } from 'node:crypto';

@Injectable()
export class AuthSessionService {
  constructor(private readonly db: PrismaService) {}
  async register(organizationId: string, userId: string, requestedExpiresAt: number) {
    if (!Number.isSafeInteger(requestedExpiresAt) || requestedExpiresAt <= Date.now() + 10000 || requestedExpiresAt > Date.now() + 3600000) throw new BadRequestException('Invalid session expiry');
    const id = randomUUID();
    await this.db.authSession.create({ data: { id, organizationId, userId, expiresAt: new Date(requestedExpiresAt) } });
    return { sessionId: id, expiresAt: requestedExpiresAt };
  }
  async revoke(organizationId: string, userId: string, sessionId: string) {
    const result = await this.db.authSession.updateMany({ where: { id: sessionId, organizationId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
    if (result.count !== 1) throw new UnauthorizedException('Session not active');
    return { revoked: true };
  }
}

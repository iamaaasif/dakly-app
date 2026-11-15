import { Injectable } from '@nestjs/common';
import {
  CloudflareAccessDriver,
  type AccessIdentity,
} from '@dakly/providers/cloudflare/access-driver';
import { loadStaffEnv } from '../platform/config/env';
import { staffError } from './admin.errors';
import type { StaffIdentity } from '@dakly/contracts/staff-auth';

@Injectable()
export class StaffAccessService {
  private readonly env = loadStaffEnv();
  private readonly driver =
    this.env.CLOUDFLARE_ACCESS_ISSUER && this.env.CLOUDFLARE_ACCESS_AUDIENCE
      ? new CloudflareAccessDriver({
          issuer: this.env.CLOUDFLARE_ACCESS_ISSUER,
          audience: this.env.CLOUDFLARE_ACCESS_AUDIENCE,
          developmentKeys: this.env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS
            ? JSON.parse(this.env.CLOUDFLARE_ACCESS_DEVELOPMENT_JWKS)
            : undefined,
        })
      : undefined;
  async verify(
    assertion: string | undefined,
    hostname: string,
    origin: string | undefined,
    method: string,
  ): Promise<AccessIdentity> {
    if (hostname !== new URL(this.env.ADMIN_ORIGIN).hostname || !assertion || !this.driver)
      throw staffError('STAFF_ACCESS_REQUIRED');
    if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(method) && origin !== this.env.ADMIN_ORIGIN)
      throw staffError('STAFF_ACCESS_REQUIRED');
    try {
      return await this.driver.verify(assertion);
    } catch {
      throw staffError('STAFF_ACCESS_REQUIRED');
    }
  }
  assertRole(staff: StaffIdentity, roles: StaffIdentity['role'][]): void {
    if (!roles.includes(staff.role)) throw staffError('STAFF_PERMISSION_DENIED');
  }
}

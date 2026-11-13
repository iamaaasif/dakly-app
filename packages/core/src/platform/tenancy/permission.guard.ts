import { type CanActivate, type ExecutionContext, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { StoreAccess } from '@dakly/contracts/team';
import { AppError, PLATFORM_ERRORS } from '../errors/app-error';
import { ACCESS_RULE, type AccessRule } from './access.decorators';
import { PERMISSION_EVALUATOR, type PermissionEvaluator } from './permission-evaluator';
import type { StoreRequest } from './store-request';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PERMISSION_EVALUATOR) private readonly evaluator: PermissionEvaluator,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<AccessRule>(ACCESS_RULE, [
      context.getHandler(),
      context.getClass(),
    ]);
    const request = context.switchToHttp().getRequest<StoreRequest>();
    if (this.allows(request, rule)) return true;
    throw new AppError('PERMISSION_DENIED', PLATFORM_ERRORS.PERMISSION_DENIED);
  }

  private allows(request: StoreRequest, rule?: AccessRule): boolean {
    switch (rule?.kind) {
      case 'public':
        return true;
      case 'user':
        return Boolean(request.userId);
      case 'member':
        return this.hasMembership(request);
      case 'permission':
        return (
          this.hasMembership(request) &&
          this.evaluator.canAccess(request.access, rule.area, rule.level)
        );
      default:
        return false;
    }
  }

  private hasMembership(request: StoreRequest): request is StoreRequest & { access: StoreAccess } {
    return Boolean(
      request.userId &&
      request.storeId &&
      request.access &&
      this.evaluator.hasKnownRole(request.access),
    );
  }
}

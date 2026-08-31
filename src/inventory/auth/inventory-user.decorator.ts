import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { InventoryPlatformUser } from './inventory-auth.service';

export const InventoryUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): InventoryPlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.inventoryUser;
  },
);

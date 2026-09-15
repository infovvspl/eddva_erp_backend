import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { SalesPurchasePlatformUser } from './sales-purchase-auth.service';

export const SalesPurchaseUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): SalesPurchasePlatformUser => {
    const request = ctx.switchToHttp().getRequest();
    return request.salesPurchaseUser;
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdmissionPlatformUser } from './admission-auth.service';
import type { AdmissionRequest } from './admission-request';

export const AdmissionUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): AdmissionPlatformUser => {
    const request = ctx.switchToHttp().getRequest<AdmissionRequest>();
    return request.admissionUser as AdmissionPlatformUser;
  },
);

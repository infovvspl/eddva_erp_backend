import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * A structured business-rule error. The project's global HttpExceptionFilter
 * reads `error` as the response's stable machine-readable `code` and
 * `details` verbatim, producing exactly the
 * `{ success:false, error:{ code, message, details } }` envelope the module
 * spec requires (§49) without needing a new filter.
 */
export class BusinessException extends HttpException {
  constructor(
    code: string,
    message: string,
    details?: Record<string, unknown>,
    status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
  ) {
    super({ error: code, message, details }, status);
  }
}

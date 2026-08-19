import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseFormat<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ResponseFormat<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ResponseFormat<T>> {
    return next.handle().pipe(
      map((data) => {
        // If data is already in standard format (e.g. register responses with data/pagination/summary)
        if (data && typeof data === 'object' && 'data' in data && 'pagination' in data) {
          return {
            success: true,
            ...data,
          };
        }
        return {
          success: true,
          data,
        };
      }),
    );
  }
}

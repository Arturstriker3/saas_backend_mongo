import { ArgumentMetadata, BadRequestException, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';

export class ZodValidationPipe<TOutput> implements PipeTransform {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const parsed = this.schema.safeParse(value);
    if (parsed.success) return parsed.data;
    const message = parsed.error.issues.map((issue) => {
      const field = issue.path.join('.');
      if (!field) return issue.message;
      return `${field}: ${issue.message}`;
    });
    throw new BadRequestException(message);
  }
}

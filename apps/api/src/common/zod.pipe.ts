import { BadRequestException, type PipeTransform } from '@nestjs/common';
import { z } from 'zod';

/** Valida el cuerpo o la consulta con un esquema de @motospa/shared. */
export class ZodPipe<T extends z.ZodType> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException({
        message: parsed.error.issues[0]?.message ?? 'Datos inválidos',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return parsed.data;
  }
}

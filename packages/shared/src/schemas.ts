/**
 * Contratos de entrada de la API (validados en NestJS y reutilizables en formularios).
 * Dinero en enteros COP.
 */
import { z } from 'zod';
import { isValidPlate, normalizePlate } from './format.js';

const money = z.number().int().nonnegative();
const positiveMoney = z.number().int().positive();
const uuid = z.uuid();
const optionalText = (max: number) => z.string().trim().max(max).optional();

export const plateSchema = z
  .string()
  .transform(normalizePlate)
  .refine(isValidPlate, 'La placa debe tener entre 4 y 8 letras o números');

export const phoneSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .refine((v) => v.length >= 7 && v.length <= 12, 'Teléfono inválido');

// --- Check-in (SPEC §4.2) ---
export const checkInSchema = z
  .object({
    plate: plateSchema,
    /** Datos de la moto si es nueva o si se quieren completar. */
    motorcycle: z
      .object({
        brand: optionalText(40),
        model: optionalText(60),
        cc: z.number().int().min(49).max(3000).optional(),
        color: optionalText(30),
      })
      .optional(),
    /** Cliente existente o datos para crearlo (mínimo teléfono). */
    customerId: uuid.optional(),
    customer: z
      .object({
        fullName: z.string().trim().min(2).max(120).optional(),
        phone: phoneSchema,
      })
      .optional(),
    type: z.enum(['WASH', 'PARKING', 'WASH_PARKING']),
    serviceIds: z.array(uuid).max(10).default([]),
    employeeIds: z.array(uuid).max(5).default([]),
    parkingSpotId: uuid.optional(),
    mileage: z.number().int().nonnegative().optional(),
    fuelLevel: z.enum(['EMPTY', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL']).optional(),
    damageNotes: optionalText(500),
    notes: optionalText(500),
    belongings: z
      .array(
        z.object({
          item: z.string().trim().min(1).max(60),
          quantity: z.number().int().min(1).max(10),
        }),
      )
      .max(10)
      .default([]),
  })
  .refine((v) => v.type === 'PARKING' || v.serviceIds.length > 0, {
    message: 'Elige al menos un servicio',
    path: ['serviceIds'],
  })
  .refine((v) => v.type !== 'PARKING' || v.serviceIds.length === 0, {
    message: 'Una orden solo de parqueo no lleva servicios',
    path: ['serviceIds'],
  });
export type CheckInInput = z.infer<typeof checkInSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export type ReasonInput = z.infer<typeof reasonSchema>;

export const assignStaffSchema = z.object({ employeeIds: z.array(uuid).min(1).max(5) });
export type AssignStaffInput = z.infer<typeof assignStaffSchema>;

export const addItemSchema = z.object({ serviceId: uuid });
export type AddItemInput = z.infer<typeof addItemSchema>;

export const deliverSchema = z.object({ belongingsReturned: z.literal(true) });
export type DeliverInput = z.infer<typeof deliverSchema>;

// --- Caja (SPEC §4.9) ---
export const openShiftSchema = z.object({ registerId: uuid, openingAmount: money });
export type OpenShiftInput = z.infer<typeof openShiftSchema>;

export const cashMovementSchema = z.object({
  type: z.enum(['INCOME', 'EXPENSE']),
  category: z.string().trim().min(2).max(40),
  amount: positiveMoney,
  description: z.string().trim().min(3).max(200),
});
export type CashMovementInput = z.infer<typeof cashMovementSchema>;

export const closeShiftSchema = z.object({
  /** Contado por medio de pago: { paymentMethodId: pesos } */
  counted: z.record(uuid, money),
  notes: optionalText(500),
});
export type CloseShiftInput = z.infer<typeof closeShiftSchema>;

export const discountSchema = z.object({
  type: z.enum(['PERCENT', 'AMOUNT']),
  value: z.number().positive(),
  reason: z.string().trim().min(3).max(200),
});

export const chargeSchema = z.object({
  workOrderId: uuid,
  discount: discountSchema.optional(),
  /** Autorización de un supervisor cuando el descuento supera el límite del rol. */
  authorization: z
    .object({ username: z.string().trim().min(3), pin: z.string().regex(/^\d{4,6}$/) })
    .optional(),
  lines: z
    .array(z.object({ paymentMethodId: uuid, amount: positiveMoney, reference: optionalText(60) }))
    .max(5),
});
export type ChargeInput = z.infer<typeof chargeSchema>;

export const reportDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato AAAA-MM-DD'),
});

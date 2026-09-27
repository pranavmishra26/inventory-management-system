const { z } = require('zod');
const { paginationSchema } = require('../../utils/commonSchemas');

const orderItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z
    .number({ error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0')
    .max(1_000_000),
});

const createOrderSchema = z.object({
  warehouseId: z.number().int().positive(),
  items: z
    .array(orderItemSchema)
    .min(1, 'An order needs at least one item')
    .max(100)
    .refine(
      (items) => new Set(items.map((i) => i.productId)).size === items.length,
      'Each product can appear only once per order',
    ),
});

const listOrdersQuery = paginationSchema.extend({
  status: z.enum(['PENDING', 'CONFIRMED', 'DISPATCHED']).optional(),
});

module.exports = { createOrderSchema, listOrdersQuery };

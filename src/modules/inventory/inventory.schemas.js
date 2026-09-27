const { z } = require('zod');
const { paginationSchema } = require('../../utils/commonSchemas');

const positiveId = z.coerce.number().int().positive();

const inventoryListQuery = paginationSchema.extend({
  productId: positiveId.optional(), // ?productId=1 -> that product across all warehouses
  warehouseId: positiveId.optional(), // ?warehouseId=1 -> everything in that warehouse
});

const inventoryItemParams = z.object({
  productId: positiveId,
  warehouseId: positiveId,
});

const stockChangeSchema = z.object({
  productId: z.number().int().positive(),
  warehouseId: z.number().int().positive(),
  quantity: z
    .number({ error: 'Quantity must be a number' })
    .int('Quantity must be a whole number')
    .positive('Quantity must be greater than 0')
    .max(1_000_000, 'Quantity is too large for a single movement'),
});

const movementsQuery = paginationSchema.extend({
  productId: positiveId.optional(),
  warehouseId: positiveId.optional(),
  type: z.enum(['STOCK_IN', 'STOCK_OUT']).optional(),
});

module.exports = { inventoryListQuery, inventoryItemParams, stockChangeSchema, movementsQuery };

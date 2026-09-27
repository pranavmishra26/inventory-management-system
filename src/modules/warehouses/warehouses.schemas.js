const { z } = require('zod');
const { booleanQuery } = require('../../utils/commonSchemas');

const createWarehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  location: z.string().trim().min(1, 'Location is required').max(200),
});

const updateWarehouseSchema = createWarehouseSchema
  .extend({ active: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

const listWarehousesQuery = z.object({
  active: booleanQuery.optional(),
});

module.exports = { createWarehouseSchema, updateWarehouseSchema, listWarehousesQuery };

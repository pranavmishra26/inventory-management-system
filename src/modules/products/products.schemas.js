const { z } = require('zod');
const { paginationSchema, booleanQuery } = require('../../utils/commonSchemas');

const price = z
  .number({ error: 'Price must be a number' })
  .positive('Price must be greater than 0')
  .max(99999999.99) // fits DECIMAL(10,2)
  .multipleOf(0.01, 'Price can have at most 2 decimal places');

const createProductSchema = z.object({
  sku: z.string().trim().min(1, 'SKU is required').max(50).toUpperCase(),
  name: z.string().trim().min(1, 'Name is required').max(200),
  description: z.string().trim().max(1000).optional(),
  price,
  categoryId: z.number().int().positive(),
});

// SKU is the product's business identity, so it cannot be changed after creation.
const updateProductSchema = createProductSchema
  .omit({ sku: true })
  .extend({ active: z.boolean() })
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

const listProductsQuery = paginationSchema.extend({
  search: z.string().trim().min(1).max(100).optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  active: booleanQuery.optional(),
});

module.exports = { createProductSchema, updateProductSchema, listProductsQuery };

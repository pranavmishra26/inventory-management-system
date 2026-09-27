const { z } = require('zod');

const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  description: z.string().trim().max(500).optional(),
});

// PATCH = partial update: every field optional, but at least one required.
const updateCategorySchema = createCategorySchema
  .partial()
  .refine((body) => Object.keys(body).length > 0, 'Provide at least one field to update');

module.exports = { createCategorySchema, updateCategorySchema };

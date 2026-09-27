// Small Zod schemas reused by several modules.
const { z } = require('zod');

// Route params arrive as strings ("42"); coerce turns them into numbers.
const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// Query strings are always text. z.coerce.boolean() would turn "false" into true
// (any non-empty string is truthy), so we accept exactly "true" / "false".
const booleanQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

module.exports = { idParamSchema, paginationSchema, booleanQuery };

const { z } = require('zod');

const changeRoleSchema = z.object({
  role: z.enum(['ADMIN', 'STAFF', 'VIEWER']),
});

module.exports = { changeRoleSchema };

const { z } = require('zod');

const email = z.string().trim().toLowerCase().pipe(z.email('Invalid email format'));

const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100),
  email,
  // bcrypt only uses the first 72 bytes of a password, so cap it there.
  password: z.string().min(8, 'Password must be at least 8 characters').max(72),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema };

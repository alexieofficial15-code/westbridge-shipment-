import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../lib/password.js";
import { Admin } from "../models/admin.model.js";

const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/api/v1/auth/login",
    // Much stricter limit than the rest of the API, to slow down password guessing.
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Email and password are required" });
      }

      const { email, password } = parsed.data;
      const admin = await Admin.findOne({ email }).lean();
      if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
        return reply.code(401).send({ error: "Invalid email or password" });
      }

      // The token carries the login, so any backend server can verify it
      // without a shared session store.
      const token = app.jwt.sign({ sub: String(admin._id), email }, { expiresIn: "8h" });
      return { token };
    },
  );
}

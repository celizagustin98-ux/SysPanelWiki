import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSession } from "@/backend/core/db";

export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  // Sin Bearer, requireSession toma la cookie de sesión.
  const session = await requireSession(authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : null);
  return next({
    context: {
      session,
      userId: session.user.id,
    },
  });
});

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSession } from "@/lib/server/postgres";

export const requireAppAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  const authHeader = request?.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("No autorizado");
  const session = await requireSession(authHeader.slice("Bearer ".length));
  return next({
    context: {
      session,
      userId: session.user.id,
    },
  });
});

import { createMiddleware } from "@tanstack/react-start";
import { api } from "./client";

export const attachAppAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const { data } = await api.auth.getSession();
  const token = data.session?.token;
  return next({
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
});

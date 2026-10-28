import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { Scalar } from "@scalar/hono-api-reference";
import auth from "./routes/auth";
import users from "./routes/users";
import type { AppEnv } from "./types";
import ghibli from "./routes/ghibli";

const app = new OpenAPIHono<AppEnv>();

app.use("*", secureHeaders());
app.use("/api/*", cors());

app.doc("/api/v1/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Banpay Users API",
    version: "1.0.0",
    description: "REST API with authentication, role-based access and Studio Ghibli proxy.",
  },
  tags: [
    { name: "Auth", description: "Authentication endpoints" },
    { name: "Users", description: "User management (admin only)" },
    { name: "Ghibli", description: "Studio Ghibli resources (role-based access)" },
  ],
  security: [{ bearerAuth: [] }],
});

app.get(
  "/api/docs",
  Scalar({
    theme: "saturn",
    spec: {
      url: "/api/v1/openapi.json",
    },
  }),
);

// Health check
app.get("/", (c) => {
  return c.text("Banpay API test");
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// Feature routes
app.route("/api/v1/auth", auth);
app.route("/api/v1/users", users);
app.route("/api/v1/ghibli", ghibli);

app.notFound((c) => {
  return c.json({ error: "Not Found" }, 404);
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal Server Error" }, 500);
});

export default app;

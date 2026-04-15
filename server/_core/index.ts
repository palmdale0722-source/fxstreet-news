import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { startCronJobs, startImapJobs, registerAdminRoutes, startWeeklyHealthCheck } from "../cronJobs";
import { registerMt4Routes } from "../mt4Routes";
import { registerStatementRoutes } from "../statementRoutes";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // 设置 HTTP 服务器超时（30 秒，足以处理数据库操作）
  server.setTimeout(30000);
  server.keepAliveTimeout = 65000;
  
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  
  // 为 MT4 推送接口设置更长的超时（防止 5203 错误）
  app.use((req, res, next) => {
    if (req.path === '/api/mt4/push' || req.path === '/api/mt4/indicators') {
      res.setTimeout(30000);
    }
    next();
  });
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);
  // Admin routes (manual trigger update)
  registerAdminRoutes(app);
  // MT4 data push routes
  registerMt4Routes(app);
  // MT4 statement import routes
  registerStatementRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`[Server] HTTP timeout: 30s, keepAliveTimeout: 65s`);
    // Start cron jobs after server is ready
    startCronJobs();
    startImapJobs();
    startWeeklyHealthCheck();
  });
}

startServer().catch(console.error);

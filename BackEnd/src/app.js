import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import http from "http";
import { errorHandler } from "./middlewares/error.middlewares.js";
const app = express();

// Create HTTP server
const server = http.createServer(app);
// Create Socket.IO server
const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  },
});

io.on("connection", (socket) => {
  // console.log("A user connected:", socket.id);

  socket.on("disconnect", () => {
    // console.log("User disconnected:", socket.id);
  });
});

app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);

//common middlewears
app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// Importing routes
import healthCheckRoutes from "./routes/healthcheck.routes.js";
import userRouters from "./routes/user.routes.js";
import linkRouters from "./routes/links.routes.js";
import chatRouters from "./routes/chat.routes.js";

// Using routes
app.use("/api/healthcheck", healthCheckRoutes);
app.use("/api/v1/users", userRouters);
app.use("/api/v1/links", linkRouters);
app.use("/api/v1/chat", chatRouters);

// Error handling middleware
app.use(errorHandler);
export { app, server, io };

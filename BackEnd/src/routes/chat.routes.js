import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middlewares.js";
import { handleChat } from "../controllers/chat.controller.js";

const router = Router();

// Apply auth middleware to all chat routes
router.use(verifyJWT);

router.post("/ask", handleChat);

export default router;

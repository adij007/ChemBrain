import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
import { readData } from "./dataStore.js";

export type AuthPayload = {
  sub: string;
  email: string;
  roles: string[];
};

export async function buildPayload(userId: string): Promise<AuthPayload | null> {
  const data = readData();
  const user = data.users.find((u) => u.id === userId);
  if (!user) return null;
  const roles = data.userRoles.filter((r) => r.userId === userId).map((r) => r.role);
  return {
    sub: user.id,
    email: user.email,
    roles,
  };
}

export function signToken(payload: AuthPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "7d" });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const token =
      req.cookies?.chembrain_token ??
      req.header("authorization")?.replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "Please sign in again.", code: "SESSION_REQUIRED" });
    const decoded = jwt.verify(token, config.jwtSecret) as AuthPayload;
    const payload = await buildPayload(decoded.sub);
    if (!payload) return res.status(401).json({ error: "Please sign in again.", code: "SESSION_EXPIRED" });
    (req as Request & { user: AuthPayload }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: "Session expired. Please sign in again.", code: "SESSION_EXPIRED" });
  }
}

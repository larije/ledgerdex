import { NextRequest } from "next/server";
import { getSessionFromRequest } from "./auth";

/**
 * Resolve the acting user for an API request.
 *
 * The app currently ships without a wired-up login (no /api/auth, nothing sets
 * the JWT cookie), so `getSessionFromRequest` returns null in normal use. To
 * keep the app usable on its single-PC LAN deployment we fall back to the
 * optional `x-user-id` header (same as the existing property/document routes)
 * and treat an unauthenticated request as *permitted* — role checks only bite
 * once a real session exists. When login is later added, gating starts working
 * automatically with no route changes.
 */
export interface RequestUser {
  id: string | null;
  role: string | null;
}

export async function getRequestUser(req: NextRequest): Promise<RequestUser> {
  const session = await getSessionFromRequest(req);
  if (session) return { id: session.id, role: session.role };
  return { id: req.headers.get("x-user-id") || null, role: null };
}

/** Any non-viewer (import, record settlement, edit account). Permissive if role unknown. */
export function canWrite(role: string | null): boolean {
  return role == null || role !== "VIEWER";
}

/** Edit/void settlements, delete an account. Permissive if role unknown. */
export function canManage(role: string | null): boolean {
  return role == null || role === "ADMIN" || role === "ASSESSOR";
}

/** Delete a whole list. Permissive if role unknown. */
export function canAdmin(role: string | null): boolean {
  return role == null || role === "ADMIN";
}

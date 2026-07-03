/**
 * DGO-07: /api/liveblocks/auth
 *
 * Genera el token de acceso Liveblocks para el usuario autenticado.
 * Liveblocks llama a este endpoint desde el authEndpoint del cliente.
 *
 * Flujo:
 *   1. web-client envía JWT en Authorization header
 *   2. requireAuth verifica el JWT y pone req.user en el request
 *   3. Este handler verifica que el usuario es miembro de la sala
 *   4. Genera token Liveblocks con el userId y permisos correctos
 *   5. Devuelve { token } al cliente
 *
 * Instalar: npm install @liveblocks/node
 */

import { Router } from "express";
import { Liveblocks } from "@liveblocks/node";
import { requireAuth } from "../middleware/auth.js";
import { supabaseAdmin } from "../lib/supabase.js";
import { errors } from "../lib/response.js";

const router = Router();

// Lazy init — igual que en wsService para evitar el problema ESM + dotenv
let _liveblocks = null;
function getLiveblocks() {
  if (!_liveblocks) {
    if (!process.env.LIVEBLOCKS_SECRET_KEY) {
      throw new Error("LIVEBLOCKS_SECRET_KEY no definida");
    }
    _liveblocks = new Liveblocks({ secret: process.env.LIVEBLOCKS_SECRET_KEY });
  }
  return _liveblocks;
}

/**
 * POST /api/liveblocks/auth
 * Body: { room: string }  ← roomId UUID de Supabase
 */
router.post("/auth", requireAuth, async (req, res) => {
  try {
    const { room: roomId } = req.body;
    const userId = req.user.id;

    console.log("[liveblocks/auth] userId:", userId);
    console.log("[liveblocks/auth] roomId:", roomId);

    // Verificar que el usuario es miembro de la sala
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("room_members") // supabaseAdmin bypasea RLS
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .single();

    console.log("[liveblocks/auth] membership:", membership, "error:", memberError?.message);

    if (memberError || !membership) {
      // Fallback: verificar si es owner directo o sala pública
      const { data: room, error: roomError } = await supabaseAdmin
        .from("rooms")
        .select("owner_id, is_public")
        .eq("id", roomId)
        .single();

      console.log("[liveblocks/auth] room:", room, "roomError:", roomError?.message);

      if (roomError || !room) {
        return errors.notFound(res, "Sala");
      }

      if (!room.is_public && room.owner_id !== userId) {
        return errors.forbidden(res);
      }
    }

    const liveblocks = getLiveblocks();

    // Preparar info del usuario para UserMeta
    const { data: profile } = await supabaseAdmin
      .from("users")
      .select("name, avatar_url")
      .eq("id", userId)
      .single();

    // Generar sesión Liveblocks
    const session = liveblocks.prepareSession(userId, {
      userInfo: {
        name: profile?.name ?? req.user.user_metadata?.name ?? req.user.email?.split("@")[0] ?? "Usuario",
        avatarUrl: profile?.avatar_url ?? null,
      },
    });

    // Permisos por rol
    const role = membership?.role;
    if (role === "viewer") {
      session.allow(roomId, session.READ_ACCESS);
    } else {
      session.allow(roomId, session.FULL_ACCESS);
    }

    const { status, body } = await session.authorize();
    console.log("[liveblocks/auth] token generado OK para sala:", roomId);

    return res.status(status).json(JSON.parse(body));
  } catch (err) {
    console.error("[liveblocks/auth] ERROR:", err);
    return errors.serverError(res, err);
  }
});

export default router;
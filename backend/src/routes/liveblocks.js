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
import { logger } from "../lib/logger.js";

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
 * @swagger
 * /api/liveblocks/auth:
 *   post:
 *     tags: [Rooms]
 *     summary: Autorizar sesión de Liveblocks
 *     description: |
 *       Endpoint que llama el cliente de Liveblocks (`authEndpoint`) para obtener un
 *       token de acceso al storage colaborativo en tiempo real de una sala. Verifica
 *       membresía (o que la sala sea pública/el usuario sea owner) antes de autorizar.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [room]
 *             properties:
 *               room:
 *                 type: string
 *                 format: uuid
 *                 description: UUID de la sala (Supabase)
 *           example:
 *             room: "8a1e...-room"
 *     responses:
 *       200:
 *         description: Token de Liveblocks generado (formato definido por el SDK de Liveblocks)
 *         content:
 *           application/json:
 *             example: { token: "eyJhbGciOiJFUzI1NiJ9..." }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Sala privada y el usuario no es miembro ni owner
 *         content:
 *           application/json:
 *             example: { ok: false, error: "Sin permisos para esta acción" }
 *       404:
 *         $ref: '#/components/responses/NotFound'
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.post("/auth", requireAuth, async (req, res) => {
  try {
    const { room: roomId } = req.body;
    const userId = req.user.id;

    logger.info({ userId, roomId }, "[liveblocks/auth] Solicitud de token recibida");

    // Verificar que el usuario es miembro de la sala
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("room_members") // supabaseAdmin bypasea RLS
      .select("role")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .single();

    logger.info(
      { userId, roomId, membership, memberError: memberError?.message },
      "[liveblocks/auth] Resultado de membership",
    );

    if (memberError || !membership) {
      // Fallback: verificar si es owner directo o sala pública
      const { data: room, error: roomError } = await supabaseAdmin
        .from("rooms")
        .select("owner_id, is_public")
        .eq("id", roomId)
        .single();

      logger.info(
        { userId, roomId, room, roomError: roomError?.message },
        "[liveblocks/auth] Resultado de fallback de sala",
      );

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
    logger.info({ userId, roomId }, "[liveblocks/auth] token generado OK para sala");

    return res.status(status).json(JSON.parse(body));
  } catch (err) {
    logger.error({ err, userId: req.user?.id, roomId: req.body?.room }, "[liveblocks/auth] ERROR");
    return errors.serverError(res, err);
  }
});

export default router;
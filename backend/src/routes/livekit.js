// src/routes/livekit.js
// DGO-13 — GET /api/livekit/token?room_id=X
//
// Devuelve un token de voz firmado SOLO si el usuario autenticado es
// miembro de la sala. El rol del miembro determina si puede publicar audio.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { createVoiceToken, getLiveKitUrl } from '../services/livekitService.js';
import { supabaseAdmin } from '../lib/supabase.js';
import { ok, fail } from '../lib/response.js';

const router = Router();

const querySchema = z.object({
  room_id: z.string().uuid({ message: 'room_id debe ser un UUID válido' }),
});

/**
 * @swagger
 * /api/livekit/token:
 *   get:
 *     tags: [Voice]
 *     summary: Obtener token de voz (LiveKit)
 *     description: |
 *       Devuelve un JWT firmado por el servidor para conectarse a la sala de audio de
 *       LiveKit correspondiente a la sala XR. Solo se emite si el usuario es miembro de
 *       la sala (o su owner). El rol determina si puede publicar audio (`owner`/`editor`)
 *       o solo escuchar (`viewer`).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: room_id
 *         in: query
 *         required: true
 *         schema: { type: string, format: uuid }
 *         description: UUID de la sala XR (se usa como nombre de room en LiveKit)
 *     responses:
 *       200:
 *         description: Token de voz generado
 *         content:
 *           application/json:
 *             example:
 *               ok: true
 *               data:
 *                 token: "eyJhbGciOiJIUzI1NiIs..."
 *                 url: "wss://tu-livekit.livekit.cloud"
 *                 room_id: "8a1e...-room"
 *                 identity: "b3f1..."
 *                 can_publish: true
 *       400:
 *         description: room_id inválido (no es un UUID)
 *         content:
 *           application/json:
 *             example: { ok: false, error: "room_id debe ser un UUID válido" }
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: El usuario no es miembro de la sala
 *         content:
 *           application/json:
 *             example: { ok: false, error: "No eres miembro de esta sala" }
 *       429:
 *         $ref: '#/components/responses/TooManyRequests'
 *       500:
 *         $ref: '#/components/responses/ServerError'
 */
router.get('/token', requireAuth, async (req, res, next) => {
  try {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return fail(res, parsed.error.issues[0].message, 400);
    }
    const { room_id } = parsed.data;
    const user = req.user; // inyectado por requireAuth

    // 1) ¿Tiene fila explícita en room_members? (sistema de roles DGO-10)
    const { data: membership } = await supabaseAdmin
      .from('room_members')
      .select('role')
      .eq('room_id', room_id)
      .eq('user_id', user.id)
      .maybeSingle();

    let role = membership?.role;

    // 2) Fallback: el owner de la sala siempre puede entrar, aunque no tenga
    //    fila en room_members (salas creadas antes del sistema de roles DGO-10).
    if (!role) {
      const { data: room } = await supabaseAdmin
        .from('rooms')
        .select('owner_id')
        .eq('id', room_id)
        .maybeSingle();
      if (room?.owner_id === user.id) role = 'owner';
    }

    if (!role) {
      return fail(res, 'No eres miembro de esta sala', 403);
    }

    const token = await createVoiceToken({
      userId: user.id,
      displayName: user.user_metadata?.display_name || user.email,
      roomId: room_id,
      role,
    });

    return ok(res, {
      token,
      url: getLiveKitUrl(),
      room_id,
      identity: user.id,
      can_publish: role !== 'viewer',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
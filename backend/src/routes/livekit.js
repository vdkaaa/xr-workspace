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
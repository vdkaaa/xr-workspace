// src/services/livekitService.js
// DGO-13 — Generación de tokens LiveKit (voz) para Unity y web.
//
// El AccessToken se firma server-side con la API secret de LiveKit Cloud.
// NUNCA exponer LIVEKIT_API_SECRET al cliente: el browser y Unity solo
// reciben el JWT ya firmado por este servicio.

import { AccessToken } from 'livekit-server-sdk';
import { logger } from '../lib/logger.js';

const { LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL } = process.env;

if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
  // Falla temprano en boot si falta config — evita tokens inválidos en runtime.
  logger.warn(
    '[livekit] Faltan variables de entorno: LIVEKIT_API_KEY / LIVEKIT_API_SECRET / LIVEKIT_URL',
  );
}

/**
 * Genera un JWT de acceso a una room de audio de LiveKit.
 *
 * @param {Object}  params
 * @param {string}  params.userId       identity única del participante (user.id de Supabase)
 * @param {string}  params.displayName  nombre visible en la UI de voz
 * @param {string}  params.roomId       id de la sala XR (se usa como nombre de room en LiveKit)
 * @param {('owner'|'editor'|'viewer')} params.role  rol del usuario en la sala
 * @returns {Promise<string>} JWT firmado
 */
export async function createVoiceToken({ userId, displayName, roomId, role }) {
  // Viewers escuchan pero no publican audio. Owner y editor sí pueden hablar.
  const canPublish = role === 'owner' || role === 'editor';

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: userId,
    name: displayName || userId,
    ttl: '1h', // el cliente re-pide token si la sesión dura más
  });

  at.addGrant({
    room: roomId,
    roomJoin: true,
    canPublish,
    canSubscribe: true,
    canPublishData: true, // permite metadata/eventos sobre el canal de datos
  });

  // En livekit-server-sdk v2+, toJwt() es async.
  return at.toJwt();
}

export function getLiveKitUrl() {
  return LIVEKIT_URL;
}
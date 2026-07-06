// src/lib/swagger.js
// DGO-18 — Configuración base de OpenAPI/Swagger para la documentación técnica.
//
// swagger-jsdoc lee los comentarios @swagger de src/routes/**/*.js (ver
// `apis` abajo) y genera el documento OpenAPI. swagger-ui-express lo sirve
// como UI interactiva en GET /api/docs (ver index.js).

import { readFileSync } from 'fs'
import path from 'path'
import swaggerJSDoc from 'swagger-jsdoc'

// Nota: evitamos `import.meta.url` a propósito — el pipeline de Babel usado
// por Jest (ver babel.config.json) no soporta esa sintaxis y rompía los
// tests. En su lugar resolvemos rutas contra process.cwd(), que en dev/start/
// test siempre es la raíz del paquete backend/ (así se invocan los scripts
// de package.json).
const ROOT_DIR = process.cwd()
const pkg = JSON.parse(readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf-8'))

const PORT = process.env.PORT || 3000

// URL de producción (Railway) — ver backend/DEPLOYMENT.md. Configurable vía
// env var para no tener que tocar código si cambia el dominio.
const PRODUCTION_URL = process.env.PUBLIC_API_URL || 'https://xr-workspace-production-1728.up.railway.app'

const definition = {
  openapi: '3.0.0',
  info: {
    title: 'XR Rooms Meet API',
    version: pkg.version,
    description:
      'API del backend de XR Rooms Meet: salas 3D colaborativas en tiempo real, ' +
      'accesibles desde Meta Quest 3 (Unity) y navegador web. Cubre autenticación, ' +
      'gestión de salas y objetos espaciales, voz (LiveKit), resúmenes con IA, ' +
      'snapshots del estado de la sala y endpoints internos/operativos.',
  },
  servers: [
    {
      url: PRODUCTION_URL,
      description: 'Producción (Railway)',
    },
    {
      url: `http://localhost:${PORT}`,
      description: 'Desarrollo local',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT de sesión de Supabase (Authorization: Bearer <access_token>). ' +
          'Algunas rutas de sala además leen un `roomToken` (JWT propio, firmado con ' +
          'JWT_SECRET) del header `x-room-token` para resolver el rol (owner/editor/viewer).',
      },
    },
    parameters: {
      RoomId: {
        name: 'id',
        in: 'path',
        required: true,
        description: 'UUID de la sala',
        schema: { type: 'string', format: 'uuid' },
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Mensaje de error' },
          details: {
            type: 'object',
            nullable: true,
            description: 'Detalles adicionales (p. ej. errores de validación por campo)',
          },
        },
      },
    },
    responses: {
      BadRequest: {
        description: 'Solicitud inválida',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'Datos inválidos en la solicitud' },
          },
        },
      },
      ValidationError: {
        description: 'Error de validación de datos (Zod)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: {
              ok: false,
              error: 'Datos inválidos',
              details: { email: ['Email inválido'] },
            },
          },
        },
      },
      Unauthorized: {
        description: 'No autenticado (falta token o token inválido)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'No autenticado' },
          },
        },
      },
      Forbidden: {
        description: 'Sin permisos para realizar esta acción (rol insuficiente, CORS, o sin acceso al recurso)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'Sin permisos para esta acción' },
          },
        },
      },
      NotFound: {
        description: 'Recurso no encontrado',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'Recurso no encontrado' },
          },
        },
      },
      Conflict: {
        description: 'Conflicto con el estado actual del recurso',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'La sala está llena (máximo 16 usuarios)' },
          },
        },
      },
      TooManyRequests: {
        description: 'Límite de peticiones excedido (rate limiting)',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'Demasiadas peticiones, intenta más tarde' },
          },
        },
      },
      ServerError: {
        description: 'Error interno del servidor',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'Error interno del servidor' },
          },
        },
      },
    },
  },
  tags: [
    { name: 'Auth', description: 'Registro, login y sesión del usuario' },
    { name: 'Rooms', description: 'Gestión de salas: crear, listar, unirse, historial' },
    { name: 'Spatial Objects', description: 'Objetos 3D dentro de una sala' },
    { name: 'Upload', description: 'Subida de archivos (imágenes/PDF) a una sala' },
    { name: 'Voice', description: 'Tokens de voz en tiempo real (LiveKit)' },
    { name: 'Summary (AI)', description: 'Resúmenes de sesión generados con IA (Claude)' },
    { name: 'Snapshots', description: 'Snapshots del estado de una sala' },
    { name: 'Internal', description: 'Uso interno/operativo — no para consumo público (cron jobs, métricas)' },
    { name: 'Metrics', description: 'Métricas operativas del servicio' },
  ],
}

// swagger-jsdoc usa `glob` internamente, que en Windows requiere separadores
// "/" — path.join produce "\\" en Windows, así que normalizamos.
const routesGlob = path.join(ROOT_DIR, 'src/routes/*.js').split(path.sep).join('/')

export const swaggerSpec = swaggerJSDoc({
  definition,
  apis: [routesGlob],
})

export default swaggerSpec

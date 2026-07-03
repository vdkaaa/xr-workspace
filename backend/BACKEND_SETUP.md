# Backend Setup — XR Rooms Meet

> Guía para levantar el backend en tu máquina. Escrita para devs que vienen de Unity — sin asumir experiencia previa en Node.js.

---

## ¿Qué es este backend?

Es un servidor que corre en tu máquina (o en la nube) y responde preguntas de la app web y del cliente Unity. Por ejemplo:
- "¿Este usuario existe?" → Auth
- "¿Cuáles son las salas disponibles?" → Rooms
- "¿Esta sala tiene espacio?" → Join con validación

Está construido con **Node.js + Express** y usa **Supabase** como base de datos.

---

## Requisitos previos

- [Node.js 20+](https://nodejs.org/en/download) — el runtime de JavaScript para el servidor
- [Git](https://git-scm.com/download/win)
- Acceso al proyecto en Supabase (pedirle las credenciales a Diego)

Verificá que Node esté instalado abriendo una terminal y corriendo:
```bash
node --version
# Debería mostrar v20.x.x o superior
```

---

## Paso 1 — Clonar el repo y entrar a la carpeta

```bash
git clone https://github.com/tu-org/xr-workspace.git
cd xr-workspace/backend
```

---

## Paso 2 — Crear el archivo de credenciales

El archivo `.env` contiene las claves privadas del proyecto. **Nunca se sube a Git.**

En la carpeta `backend/`, copiás el archivo de ejemplo:
```bash
cp .env.example .env
```

Abrís el `.env` con cualquier editor y completás los valores que te pasa Diego:
```env
SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

PORT=3000
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173
```

> ⚠️ Sin este archivo el servidor no arranca. Pedirle las credenciales a Diego.

---

## Paso 3 — Instalar dependencias

```bash
npm install
```

Esto descarga todas las librerías necesarias a la carpeta `node_modules/`. Tarda un minuto la primera vez.

---

## Paso 4 — Correr el servidor

```bash
npm run dev
```

Si todo está bien, vas a ver esto en la terminal:
```
🚀 XR Rooms Backend corriendo en http://localhost:3000
   Entorno: development
   Health:  http://localhost:3000/health
```

Abrís el navegador en `http://localhost:3000/health` y deberías ver:
```json
{"ok":true,"service":"xr-rooms-backend","env":"development"}
```

---

## Endpoints disponibles

### Auth
| Método | Ruta | Qué hace |
|--------|------|----------|
| POST | `/api/auth/register` | Crea un usuario nuevo |
| POST | `/api/auth/login` | Inicia sesión, devuelve un token |
| GET | `/api/auth/me` | Devuelve el usuario autenticado |

### Rooms
| Método | Ruta | Qué hace |
|--------|------|----------|
| GET | `/api/rooms` | Lista las salas del usuario |
| POST | `/api/rooms` | Crea una sala nueva |
| GET | `/api/rooms/:id` | Detalle de una sala |
| PATCH | `/api/rooms/:id` | Edita una sala (solo el owner) |
| DELETE | `/api/rooms/:id` | Elimina una sala (solo el owner) |
| POST | `/api/rooms/:id/join` | Unirse a una sala |

### ¿Cómo se usa el token?

Después de hacer login, el servidor te devuelve un `access_token`. Para cualquier endpoint que requiera autenticación, lo mandás en el header:
```
Authorization: Bearer eyJhbGci...
```

---

## Estructura de archivos

```
backend/
├── src/
│   ├── index.js              ← Entrada del servidor
│   ├── lib/
│   │   ├── supabase.js       ← Conexión a la base de datos
│   │   └── response.js       ← Formato estándar de respuestas
│   ├── middleware/
│   │   ├── auth.js           ← Verifica el token JWT
│   │   └── errorHandler.js   ← Manejo de errores global
│   ├── validators/
│   │   └── schemas.js        ← Validación de datos de entrada
│   ├── services/
│   │   ├── authService.js    ← Lógica de autenticación
│   │   └── roomService.js    ← Lógica de salas
│   └── routes/
│       ├── auth.js           ← Rutas de auth
│       └── rooms.js          ← Rutas de rooms
├── supabase/
│   └── migrations/           ← Historial de cambios en la BD
├── .env.example              ← Plantilla de credenciales
├── .gitignore
└── package.json
```

---

## Problemas comunes

**"Cannot find module"** → Corriste `npm install`?

**"No autenticado"** → El token expiró (dura 1 hora). Hacé login de nuevo.

**"Permission denied for table rooms"** → Falta ejecutar los GRANTs en Supabase. Avisarle a Diego.

**"Too Many Requests"** → Hiciste demasiadas requests seguidas. Esperá 15 minutos o reiniciá el servidor.

---

https://app.notion.com/p/Backend-Setup-Gu-a-para-Paper-y-Felipe-373f190a45488163a03fd3d34d02c11e
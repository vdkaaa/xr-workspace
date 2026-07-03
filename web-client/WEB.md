# Web Client Setup — XR Rooms Meet

> Guía para levantar el web client en tu máquina. Escrita para devs que vienen de Unity — sin asumir experiencia previa en React.

---

## ¿Qué es el web client y para qué sirve?

Es la aplicación web del proyecto — lo que un usuario ve en el navegador. Está construida con **React + TypeScript** usando **Vite** como herramienta de desarrollo.

Por ahora tiene:
- Pantalla de Login y Register
- Pantalla de listado de salas
- Modal para crear salas nuevas

Más adelante va a tener la escena 3D con React Three Fiber donde se van a ver los avatares y los objetos espaciales.

---

## ¿Qué necesitás antes de arrancar?

- **Node.js 20+** → https://nodejs.org/en/download
- **El backend corriendo** en `http://localhost:3000` (ver `backend/BACKEND_SETUP.md`)
- **Git** → https://git-scm.com/download/win

Verificá que Node esté instalado abriendo una terminal y corriendo:
```bash
node --version
# Debería mostrar v20.x.x o superior
```

> ⚠️ El web client necesita el backend corriendo para funcionar. Si el backend está apagado, el login va a fallar con "Failed to fetch".

---

## Paso a paso para levantar el web client

### 1. Entrar a la carpeta

```bash
cd xr-workspace/web-client
```

### 2. Crear el archivo de configuración

```bash
cp .env.example .env
```

El `.env` del web client solo tiene una variable — la URL del backend:
```env
VITE_API_URL=http://localhost:3000
```

No necesitás las credenciales de Supabase acá — eso lo maneja el backend.

### 3. Instalar dependencias

```bash
npm install
```

### 4. Correr el web client

```bash
npm run dev
```

Abrís el navegador en `http://localhost:5173` y deberías ver la pantalla de login.

---

## ¿Qué hace cada archivo?

```
web-client/
├── src/
│   ├── App.tsx                   ← Director de tráfico: decide qué pantalla mostrar
│   ├── main.tsx                  ← Entrada de la app, monta React en el HTML
│   ├── index.css                 ← Estilos globales y variables de color
│   │
│   ├── lib/
│   │   └── api.ts                ← Todas las llamadas al backend en un solo lugar
│   │
│   ├── stores/
│   │   ├── authStore.ts          ← Memoria global del usuario autenticado
│   │   └── roomStore.ts          ← Memoria global de las salas
│   │
│   ├── components/
│   │   └── ui/index.tsx          ← Componentes reutilizables: Button, Input, Card
│   │
│   └── pages/
│       ├── AuthPage.tsx          ← Pantalla de Login y Register
│       └── RoomsPage.tsx         ← Pantalla de salas + modal crear sala
│
├── .env.example                  ← Plantilla de configuración
├── .gitignore
├── index.html                    ← HTML base donde se monta React
├── package.json
├── tailwind.config.js            ← Configuración de estilos
├── tsconfig.json                 ← Configuración de TypeScript
└── vite.config.ts                ← Configuración del servidor de desarrollo
```

---

## ¿Cómo funciona por dentro?

### El flujo de una acción (ejemplo: login)

```
Usuario llena el form y hace click en "Iniciar sesión"
        ↓
AuthPage.tsx llama a authStore.login(email, password)
        ↓
authStore llama a api.auth.login(email, password)
        ↓
api.ts hace un POST a http://localhost:3000/api/auth/login
        ↓
El backend responde con { session: { access_token: "eyJ..." } }
        ↓
authStore guarda el token en localStorage y el user en memoria
        ↓
App.tsx detecta que hay usuario → muestra RoomsPage
```

### ¿Qué es un Store?

En Unity usarías un Singleton o un ScriptableObject para guardar estado global. En React usamos **Zustand** — es lo mismo: un objeto global que cualquier componente puede leer o modificar.

- `authStore` → guarda el usuario logueado y el token
- `roomStore` → guarda la lista de salas

### ¿Qué es el token y por qué se guarda?

Cuando hacés login, el backend te da un `access_token` — una cadena larga que prueba tu identidad. Se guarda en `localStorage` para que si cerrás el navegador y volvés, no tengas que loguearte de nuevo. Dura 1 hora.

---

## Pantallas disponibles

| Pantalla | Ruta | Descripción |
|----------|------|-------------|
| Login / Register | `/` (sin sesión) | Formulario de autenticación |
| Salas | `/` (con sesión) | Lista de salas + crear nueva |

> Por ahora no hay rutas de navegación — la app decide qué mostrar según si hay sesión activa o no.

---

## Problemas comunes

**"Failed to fetch"** → El backend no está corriendo. Abrí otra terminal y corré `npm run dev` dentro de `backend/`.

**Pantalla en blanco** → Abrí las DevTools del navegador (`F12`) → pestaña Console → fijate qué error aparece.

**"No autenticado"** → El token expiró (dura 1 hora). Cerrá sesión y volvé a loguearte.

**Los estilos no cargan** → Corré `npm install` de nuevo, puede que falte alguna dependencia de Tailwind.

---

## Stack tecnológico

| Tecnología | Para qué se usa |
|-----------|----------------|
| React 18 | Librería de UI |
| TypeScript | JavaScript con tipos — menos bugs |
| Vite | Servidor de desarrollo, compila el código |
| Tailwind CSS | Estilos con clases utilitarias |
| Zustand | Estado global (stores) |
| React Three Fiber | Escena 3D (próxima semana) |

---

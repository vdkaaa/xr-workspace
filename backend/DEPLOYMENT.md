## Deploy

Backend desplegado en Railway.

- **URL producción:** https://xr-workspace-production.up.railway.app
- **Health check:** https://xr-workspace-production.up.railway.app/health
- **Branch:** feature/backend
- **Auto-deploy:** activado — cada push a `feature/backend` despliega automáticamente

## Variables de entorno requeridas

Cargar en Railway → Variables:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT` → 3000
- `NODE_ENV` → production
- `ALLOWED_ORIGINS` → orígenes permitidos separados por coma
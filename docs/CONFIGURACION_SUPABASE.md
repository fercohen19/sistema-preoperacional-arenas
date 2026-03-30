# Configuracion de Supabase

## Variables requeridas

Cree un archivo `.env.local` dentro de `sistema-preoperacional` con:

```env
NEXT_PUBLIC_APP_NAME="ARENAS Transporte"
NEXT_PUBLIC_APP_URL="https://app.arenastransporte.com"
NEXT_PUBLIC_PUBLIC_VALIDATION_URL="https://arenastransporte.com/validar"
NEXT_PUBLIC_SUPABASE_URL="https://TU-PROYECTO.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="TU-ANON-KEY"
```

## Orden recomendado

1. Crear proyecto en Supabase.
2. Ejecutar [schema_supabase.sql](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\schema_supabase.sql).
3. Ejecutar [seed_maestros.sql](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\seed_maestros.sql).
4. Ejecutar [business_rules.sql](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\business_rules.sql).
5. Copiar URL y `anon key` al archivo `.env.local`.

## Estado actual

El proyecto ya detecta si Supabase esta configurado.

- Si no lo esta, permite continuar en modo base.
- Si ya lo esta, el formulario de acceso intenta autenticacion real.

# Dominio y publicacion

## Uso recomendado del dominio

El dominio `arenastransporte.com` es muy util para esta solucion.

### Recomendacion

- `app.arenastransporte.com` para el aplicativo interno
- `arenastransporte.com/validar/{codigo}` o `validar.arenastransporte.com/{codigo}` para la validacion publica por QR

## Hosting recomendado

Aunque el dominio este en Hostinger, el aplicativo puede publicarse mejor asi:

- frontend en `Vercel`
- base de datos y storage en `Supabase`
- dominio administrado desde Hostinger apuntando por DNS

## Ventaja

Esto permite:

- no tener servidor propio
- mantener el sitio publico y el sistema separados
- usar el dominio oficial en los QR de los PDFs
- dar mas confianza al validar la autenticidad del documento

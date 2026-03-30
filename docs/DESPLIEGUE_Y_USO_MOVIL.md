# Despliegue y uso movil

## Como se usara la aplicacion

La aplicacion no necesita descargarse desde Play Store o App Store.

Se usara como **aplicacion web** publicada en el dominio de la empresa, por ejemplo:

- `https://app.arenastransporte.com`

Los conductores entran desde el navegador del celular, inician sesion y pueden:

- diligenciar el preoperacional
- adjuntar fotos
- firmar en pantalla
- generar el PDF

Luego pueden **anclarla a la pantalla de inicio** para usarla como si fuera una app.

## Como la agregan los conductores al celular

### En Android

1. Abrir `https://app.arenastransporte.com`
2. Entrar con usuario y clave
3. En Chrome tocar el menu
4. Elegir `Agregar a pantalla principal`

### En iPhone

1. Abrir `https://app.arenastransporte.com` en Safari
2. Tocar compartir
3. Elegir `Agregar a pantalla de inicio`

## Como desplegarla

La recomendacion es publicar en **Vercel**, porque el proyecto ya esta hecho en `Next.js` y no requiere servidor propio.

### Ruta recomendada

- Dominio principal: `arenastransporte.com`
- Aplicacion: `app.arenastransporte.com`
- Validacion publica QR: `arenastransporte.com/validar/{codigo}` o `app.arenastransporte.com/validar/{codigo}`

## Pasos de despliegue en Vercel

1. Crear cuenta en [https://vercel.com](https://vercel.com)
2. Subir el proyecto `sistema-preoperacional` a GitHub
3. Importar el repositorio en Vercel
4. Configurar las variables de entorno:

```env
NEXT_PUBLIC_APP_NAME="Arenas Transporte y Turismo"
NEXT_PUBLIC_APP_URL="https://app.arenastransporte.com"
NEXT_PUBLIC_PUBLIC_VALIDATION_URL="https://app.arenastransporte.com/validar"
NEXT_PUBLIC_SUPABASE_URL="TU_PROJECT_URL"
NEXT_PUBLIC_SUPABASE_ANON_KEY="TU_PUBLISHABLE_KEY"
```

5. Desplegar
6. En Hostinger crear el subdominio `app`
7. Apuntar `app.arenastransporte.com` hacia Vercel

## Que gana la empresa con esta salida

- no depende de instalar nada en cada telefono
- cualquier conductor entra con link y usuario
- los cambios del sistema se publican una sola vez
- el QR y los PDFs quedan centralizados
- la administracion consulta todo desde cualquier equipo

## Recomendacion operativa

Para los conductores, la mejor experiencia inicial es:

- entregarles el link
- crear sus usuarios
- pedirles que lo agreguen a pantalla de inicio

Eso da una experiencia muy parecida a una app descargada, pero con mucho menos complejidad.

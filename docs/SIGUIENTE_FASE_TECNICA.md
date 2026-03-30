# Siguiente fase tecnica

## Lo que ya quedo adelantado

- arquitectura funcional del MVP
- esquema inicial de base de datos
- reglas del preoperacional y del FUEC
- checklist y evidencias obligatorias
- esqueleto del aplicativo en Next.js
- ruta de validacion publica por QR
- modulo visual inicial para emision de FUEC
- semillas SQL de vehiculos y conductores actuales

## Lo siguiente a implementar

### 1. Autenticacion real

- conectar Supabase Auth
- crear usuarios por rol
- restringir rutas por sesion

### 2. Persistencia real

- guardar inspecciones
- guardar items del checklist
- subir fotos y firma a storage
- generar codigo de verificacion

### 3. PDF real

- crear plantilla HTML espejo del formato normativo
- renderizar PDF en funcion serverless
- guardar URL final

### 4. FUEC real

- levantar formulario final con todos los campos normativos
- liberar consecutivo solo si pasa validaciones
- generar PDF final con QR

## Dependencias externas pendientes

Para ejecutar esta fase faltan herramientas de entorno:

- Node.js
- npm
- proyecto Supabase
- credenciales del dominio o DNS para publicacion

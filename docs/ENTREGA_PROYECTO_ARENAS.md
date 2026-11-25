# Entrega Proyecto Arenas Transporte y Turismo

## 1. Resumen ejecutivo

Este proyecto corresponde al aplicativo web para:

- diligenciamiento de preoperacional en tiempo real
- generacion automatica de PDF del preoperacional
- emision de FUEC condicionada a preoperacional valido
- descarga de FUEC por parte del conductor
- consulta administrativa, filtros y exportaciones
- validacion publica por codigo/QR

Tecnologia principal:

- Frontend: Next.js 16.2.1 + React 19
- Backend/DB/Auth/Storage: Supabase
- Hosting: Vercel
- Dominio publico: Hostinger + Vercel

Portal productivo actual:

- [https://app.arenastransporte.com](https://app.arenastransporte.com)

Validacion publica:

- [https://app.arenastransporte.com/validar/{codigo}](https://app.arenastransporte.com/validar/{codigo})

## 2. Estado funcional actual

El sistema actualmente soporta:

- Login por roles `administrador` y `conductor`
- Panel del conductor
- Panel administrativo
- Registro de preoperacional
- Evidencias fotograficas obligatorias
- Firma dibujada en pantalla
- Generacion automatica de PDF del preoperacional
- Emision de FUEC condicionada a preoperacional valido del dia
- Descarga de FUEC por el conductor
- Historial administrativo de preoperacionales y FUEC
- Exportacion de Excel por rango de fechas
- Exportacion masiva de PDF
- Cola administrativa de preoperacionales listos para FUEC
- Trazabilidad visible de quien diligencio y quien emitio
- Anexo obligatorio fijo del FUEC agregado al PDF

## 3. Arquitectura general

### 3.1 Flujo funcional

1. El conductor inicia sesion.
2. Diligencia el preoperacional.
3. El sistema guarda inspeccion, items, evidencias y PDF.
4. El administrador ve en la cola que existe un preoperacional listo para FUEC.
5. El administrador emite el FUEC.
6. El sistema valida reglas, genera PDF del FUEC y anexa la pagina obligatoria fija.
7. El conductor puede descargar sus FUEC emitidos desde su panel.

### 3.2 Integraciones

- Supabase Auth: autenticacion de usuarios
- Supabase Database: tablas de negocio
- Supabase Storage: evidencias, firmas y documentos PDF
- Vercel: despliegue del frontend
- Hostinger: configuracion DNS del subdominio

## 4. Portal, despliegue y operacion

### 4.1 URL productiva

- [https://app.arenastransporte.com](https://app.arenastransporte.com)

### 4.2 Proyecto en Supabase

- Proyecto: `arenas-preoperacional`

### 4.3 Proyecto en Vercel

- Proyecto productivo: `sistema-preoperacional-arenas`

### 4.4 Variables de entorno esperadas

Basadas en:
[.env.example](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\.env.example)

Variables:

- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_PUBLIC_VALIDATION_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Observacion:

- `.env.local` no debe subirse a Git
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` es publica por diseño, pero depende de RLS para seguridad

## 5. Estructura de carpetas y archivos principales

### 5.1 Raiz del proyecto

Proyecto principal:
[sistema-preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional)

Archivos raiz importantes:

- [package.json](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\package.json)
- [next.config.mjs](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\next.config.mjs)
- [tsconfig.json](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\tsconfig.json)
- [.env.example](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\.env.example)
- [README.md](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\README.md)

### 5.2 Rutas del aplicativo

- [Inicio](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\page.tsx)
- [Layout principal](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\layout.tsx)
- [Estilos globales](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\globals.css)
- [Login](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\login\page.tsx)
- [Panel conductor](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\conductor\page.tsx)
- [Panel admin](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\admin\page.tsx)
- [Modulo FUEC admin](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\admin\fuec\page.tsx)
- [Validacion publica](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\validar\[codigo]\page.tsx)
- [Health endpoint](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\api\health\route.ts)
- [Manifest PWA](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\app\manifest.ts)

### 5.3 Componentes funcionales principales

- [Formulario preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\preoperational-form.tsx)
- [Formulario FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\fuec-form.tsx)
- [Firma digital dibujada](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\signature-pad.tsx)
- [Guard de autenticacion](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\auth-guard.tsx)
- [Redireccion por login](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\login-redirect.tsx)
- [Descarga FUEC conductor](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\driver-fuec-downloads.tsx)
- [Cola preoperacionales listos para FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\pending-fuec-queue.tsx)
- [Panel administrativo de operaciones](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\admin-operations-panel.tsx)
- [Navegacion principal](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\main-nav.tsx)
- [Shell de la app](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\components\app-shell.tsx)

### 5.4 Librerias de negocio

- [Cliente Supabase](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\supabase.ts)
- [Guardado preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\preoperational.ts)
- [Generacion PDF preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\pdf.ts)
- [Guardado y PDF FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\fuec.ts)
- [Usuario actual / rol](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\current-user.ts)
- [Contratos desde JSON](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\contracts.ts)
- [Fechas Bogota](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\date-utils.ts)
- [Utilidades de validacion documental](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\document-utils.ts)

### 5.5 Datos de negocio en archivos

- [Checklist preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\data\checklist_preoperacional.json)
- [Evidencias obligatorias](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\data\evidencias_obligatorias.json)
- [Contratos cargados actualmente](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\data\contratos.json)

### 5.6 Activos publicos

- [Logo principal](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\public\logo-arenas.png)
- [Logo empresa FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\public\fuec-logos\empresa.png)
- [Logo mintransporte FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\public\fuec-logos\mintransporte.png)
- [Logo supertransporte FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\public\fuec-logos\supertransporte.png)
- [Anexo obligatorio fijo del FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\public\fuec-anexo-obligatorio.pdf)

## 6. Base de datos y SQL

### 6.1 SQL principal

- [Esquema principal](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\schema_supabase.sql)
- [Reglas de negocio](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\business_rules.sql)
- [Seed de maestros](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\seed_maestros.sql)

### 6.2 Migraciones aplicadas/preparadas

- [Licencia en conductores](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\migrations\2026-03-29_add_licencia_to_conductores.sql)
- [Valor de inspeccion_items a text](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\migrations\2026-03-29_alter_inspeccion_items_valor_to_text.sql)
- [Series globales de preoperacional y FUEC](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\migrations\2026-04-04_series_globales_preoperacional_y_fuec.sql)

### 6.3 Tablas clave

- `public.usuarios`
- `public.conductores`
- `public.vehiculos`
- `public.asignaciones_vehiculo_conductor`
- `public.inspecciones_preoperacionales`
- `public.inspeccion_items`
- `public.inspeccion_evidencias`
- `public.series_documentales`
- `public.fuecs`
- `public.documentos_verificables`
- `public.auditoria_eventos`

### 6.4 Buckets esperados en Storage

- `inspecciones`
- `firmas`
- `documentos`

## 7. Como esta conectado el sistema

### 7.1 Login y perfil

- El usuario se autentica contra Supabase Auth.
- Luego el sistema busca el perfil interno en `public.usuarios` usando `auth_user_id`.
- Con eso determina el `rol` (`administrador` o `conductor`).

### 7.2 Conductores

- El conductor operativo existe en `public.conductores`.
- El usuario de acceso existe en `Auth` y se relaciona con `public.usuarios`.
- Idealmente `documento` debe coincidir entre `public.usuarios` y `public.conductores`.

### 7.3 Preoperacional

- Se valida vehiculo y conductor.
- Se guarda encabezado en `inspecciones_preoperacionales`.
- Se guardan items en `inspeccion_items`.
- Se guardan fotos/firma en Storage y referencias en `inspeccion_evidencias`.
- Se genera PDF y se guarda en `documentos`.
- Se registra validacion en `documentos_verificables`.

### 7.4 FUEC

- Solo lo emite administracion.
- Requiere preoperacional habilitante del dia.
- Toma contrato desde `src/data/contratos.json`.
- Genera consecutivo.
- Genera PDF.
- Agrega el anexo obligatorio fijo del FUEC.
- Guarda PDF en Storage y referencia en `fuecs` y `documentos_verificables`.

## 8. Consecutivos

### 8.1 Preoperacional

Formato actual:

- `PO-AAAA-DDMM###`

Comportamiento actual corregido:

- el bloque `###` aumenta de forma acumulada por documento y año
- ya no se reinicia por dia

Logica:

- [preoperational.ts](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\preoperational.ts)
- migracion:
  [2026-04-04_series_globales_preoperacional_y_fuec.sql](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sql\migrations\2026-04-04_series_globales_preoperacional_y_fuec.sql)

### 8.2 FUEC

Formato actual:

- `208518525 + AAAA + contrato + consecutivo`

Comportamiento actual corregido:

- los ultimos 4 digitos aumentan de forma acumulada por documento y año
- ya no se reinician por contrato

Logica:

- [fuec.ts](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\lib\fuec.ts)

## 9. Manejo actual de contratos

Estado actual:

- el sistema **no** lee el Excel en tiempo real
- lee el archivo:
  [contratos.json](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional\src\data\contratos.json)

Implicacion:

- si cambia el Excel, el sistema no cambia automaticamente
- hay que actualizar el JSON para reflejar nuevos contratos

Archivo fuente de negocio usado historicamente:

- `DATOS PARA CONTRATOS.xlsx`

Riesgo:

- errores de formato JSON pueden romper build o funcionamiento
- existe dependencia manual del equipo para mantener coherencia

Recomendacion:

- migrar contratos a base de datos en una siguiente fase

## 10. Seguridad: riesgos y puntos de atencion

### 10.1 Riesgo alto: RLS deshabilitado

Situacion actual:

- el `Security Advisor` de Supabase reporta RLS deshabilitado en multiples tablas del esquema `public`

Impacto:

- la seguridad a nivel fila no esta endurecida en base de datos
- el control actual depende mas del frontend/logica que de politicas reales en Supabase

Riesgo:

- un cliente autenticado con la `anon key` podria potencialmente consultar o mutar datos si las APIs quedaran expuestas sin politicas

Recomendacion critica:

- activar RLS con politicas por rol para tablas clave
- minimo:
  - `usuarios`
  - `conductores`
  - `vehiculos`
  - `inspecciones_preoperacionales`
  - `inspeccion_items`
  - `inspeccion_evidencias`
  - `fuecs`
  - `documentos_verificables`

### 10.2 Riesgo medio-alto: contratos fuera de la base

Situacion actual:

- contratos viven en JSON dentro del frontend

Impacto:

- riesgo de desactualizacion
- riesgo de inconsistencias entre Excel, JSON y contratos reales
- cambios manuales pueden romper despliegue si el JSON queda invalido

### 10.3 Riesgo medio: gestion de usuarios duplicada

Situacion actual:

- los usuarios deben existir en:
  - Supabase Auth
  - `public.usuarios`
  - y a veces tambien en `public.conductores`

Impacto:

- si falta `auth_user_id`
- si el documento no coincide
- o si el conductor no existe en `public.conductores`
  el sistema puede autenticar pero no operar correctamente

### 10.4 Riesgo medio: despliegue manual con copia de carpetas

Situacion actual:

- existe una carpeta real y una carpeta clonada para publicar

Impacto:

- riesgo de olvidar copiar `src` o `public`
- riesgo de subir version incompleta
- riesgo de inconsistencias entre local y produccion

### 10.5 Riesgo medio: proyecto Supabase en pausa

Observacion operativa:

- si el proyecto Supabase se pausa, la app queda inaccesible funcionalmente aunque el frontend siga desplegado

Accion:

- al reactivar plan/proyecto puede requerir `Resume project`

### 10.6 Riesgo medio: borrados directos por SQL

Situacion actual:

- limpieza de registros de prueba se hace manual por SQL

Impacto:

- posible borrado accidental de registros validos

Recomendacion:

- en una siguiente fase crear anulacion logica o estados, no borrado duro

## 11. Controles funcionales ya implementados

- conductor no ve otros conductores al diligenciar
- conductor no emite FUEC
- administrador ve cola de pendientes para FUEC
- licencia vencida bloquea emision de FUEC
- alerta si la licencia esta cerca a vencer
- FUEC visible para conductor solo si ya fue emitido
- trazabilidad de `Diligenciado por` y `Emitido por`

## 12. Operacion diaria recomendada

### 12.1 Alta de usuario conductor

1. Crear usuario en `Authentication > Users`
2. Crear o verificar registro en `public.usuarios`
3. Asignar `auth_user_id`
4. Crear o verificar registro en `public.conductores`
5. Verificar documento, licencia, vigencia y estado

### 12.2 Flujo diario

1. conductor inicia sesion
2. diligencia preoperacional
3. administracion revisa cola de pendientes
4. administracion emite FUEC
5. conductor descarga FUEC si lo necesita

## 13. Rutas de trabajo local

### 13.1 Carpeta real del proyecto

[sistema-preoperacional](C:\Users\calidad1\OneDrive - OFFICE EMPRESARIAL\Escritorio\ARENAS TOURS\PREOPERACIONAL\sistema-preoperacional)

### 13.2 Carpeta clonada para publicar

Segun el flujo operativo actual, existe una copia clonada interna usada para `commit/push` manual. Debe revisarse en el equipo actual para confirmar la ruta exacta vigente, porque este punto ha sido una fuente de friccion operativa.

### 13.3 Regla practica actual de despliegue

Normalmente se copia desde la carpeta real hacia la clonada:

- `src`
- `public`
- archivos raiz necesarios (`package.json`, `next.config.mjs`, etc.) cuando aplique

No se copian:

- `.env.local`
- `.next`
- `node_modules`
- `tsconfig.tsbuildinfo`

## 14. Recomendaciones prioritarias

### Prioridad alta

- Activar RLS con politicas correctas en Supabase
- Migrar contratos a base de datos
- Unificar flujo Git para no depender de copia manual

### Prioridad media

- Crear modulo de administracion de conductores/usuarios
- Crear anulacion logica de FUEC y preoperacionales de prueba
- Agregar politica de respaldo de contratos y documentos

### Prioridad baja

- Limpiar advertencias de `themeColor` en Next.js
- Mejorar automatizacion de importacion desde Excel

## 15. Entregables relevantes ya construidos

- aplicativo web en produccion
- login por roles
- preoperacional con fotos y firma
- PDF de preoperacional
- FUEC con formato reglamentado operativo
- anexo obligatorio fijo del FUEC
- validacion por codigo/QR
- historial administrativo
- exportaciones Excel/PDF

## 16. Nota final

El sistema ya es funcional y operable, pero todavia tiene deuda tecnica y de seguridad que conviene atender antes de escalar usuarios o automatizar procesos mas sensibles. La principal deuda hoy es `RLS` en Supabase y la dependencia de `contratos.json` como fuente operativa.

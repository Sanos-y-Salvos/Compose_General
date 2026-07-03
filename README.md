# Sanos y Salvos

Plataforma chilena para el reporte y recuperación de mascotas perdidas y encontradas. Construida como un sistema de microservicios con comunicación asíncrona orientada a eventos.

---

## Descripción general

Sanos y Salvos permite a ciudadanos, veterinarias y municipalidades publicar reportes de mascotas perdidas o encontradas. El sistema cruza automáticamente los reportes mediante un motor de emparejamiento que calcula similitud por color, tamaño, distancia geográfica y chip de identificación. Cuando existe una coincidencia relevante, el dueño del reporte de pérdida puede aceptarla y se habilita un canal de mensajería privada en tiempo real entre los usuarios involucrados. El panel de administración permite a moderadores y administradores gestionar usuarios, reportes y tickets de soporte.

---

## Arquitectura

### Capas del sistema

```
Navegador
  └── Frontend React (Vite + Tailwind + Leaflet)
        └── nginx (puerto 80 en Docker, 5173 en desarrollo local)
              └── API Gateway express-gateway (8000 externo / 8080 interno)
                    └── BFF — Backend for Frontend (puerto 3000)
                          ├── ms-auth          (puerto 3001)
                          ├── ms-users         (puerto 3002)
                          ├── ms_mascotas      (puerto 3003)
                          ├── ms-localizacion  (puerto 3004)
                          └── ms-soporte       (puerto 3005)

Acceso directo desde el navegador (no pasan por el Gateway ni el BFF):
  ms-mensajeria-privada  →  REST de salas y WebSocket Socket.io  (puerto 3006)

Solo comunicación interna por RabbitMQ (no expuesto al navegador):
  ms-matching            →  motor de emparejamiento
```

### Enrutamiento del Gateway

El Gateway aplica pipelines diferenciados por ruta:

- `mascotas_pipeline` — aplica JWT, inyecta `x-user-id` y `x-user-role`. Cubre todas las rutas de mascotas excepto la pública.
- `mascotas_publico_pipeline` — sin JWT. Cubre únicamente `GET /api/mascotas/reportes` (listado público). En el stack Docker, nginx dirige esta ruta directamente al BFF sin pasar por el Gateway.
- `localizacion_pipeline` — sin JWT. Permite `GET` y `OPTIONS` al servicio de mapa.
- Resto de pipelines (auth, users, tickets, etc.) — cada uno con su propia configuración de JWT y rate limiting.

### Comunicación asíncrona (RabbitMQ)

Existen dos exchanges independientes:

- `user.events` (topic): ms-users publica eventos de ciclo de vida (registro, actualización, eliminación, cambio de contraseña). ms-auth los consume para mantener su réplica local de credenciales en la cola `ms-auth.user-events` con binding `user.#`.
- `sanos_y_salvos_events` (topic): ms_mascotas publica eventos `mascota.reporte.*`. ms-localizacion y ms-matching los consumen para actualizar sus propias tablas. ms-matching también publica `matching.match.aceptado` en este mismo exchange cuando se acepta un match; ms-mensajeria-privada lo consume para crear la sala de chat.

Los consumidores Python (ms-localizacion, ms-matching) inician su conexión a RabbitMQ como tarea asíncrona en el lifespan de FastAPI: si RabbitMQ no está disponible, el servicio HTTP arranca igual.

---

## Mapa de servicios

| Carpeta | Servicio | Puerto externo | Stack |
|---|---|---|---|
| frontend-sanos-salvos | Frontend | 80 (Docker) / 5173 (dev) | React 19, TypeScript, Tailwind CSS, Leaflet, Vite |
| ExpressGateway/api-gateway | API Gateway | 8000 | express-gateway, JWT, CORS, rate-limit, circuit-breaker |
| bff_fullstack | BFF | 3000 | Express 4, TypeScript |
| ms-auth | Autenticación | 3001 | Express 5, TypeScript, TypeORM, PostgreSQL, Redis, RabbitMQ |
| ms-users | Gestión de usuarios | 3002 | Express 5, TypeScript, TypeORM, PostgreSQL, Cloudinary, Nodemailer |
| ms_mascotas | Mascotas y reportes | 3003 | Express 4, TypeScript, TypeORM, PostgreSQL, RabbitMQ, Multer |
| ms-localizacion | Geolocalización | 3004 | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL + PostGIS, Alembic |
| ms-soporte | Tickets de soporte y chatbot | 3005 | Express 5, TypeScript, TypeORM, PostgreSQL, Resend |
| ms-matching | Motor de emparejamiento | interno | Python 3.12, FastAPI, SQLAlchemy, PostgreSQL, RabbitMQ |
| ms-mensajeria-privada | Mensajería en tiempo real | 3006 | Express 4, TypeScript, Socket.io, TypeORM, PostgreSQL |

---

## Requisitos previos

- Docker Desktop con soporte a contenedores Linux
- Node.js 20 o superior (solo para ejecutar el seed)
- Git (para clonar los repositorios)

No se requiere instalar PostgreSQL, Redis ni RabbitMQ localmente. Todos los servicios de infraestructura corren como contenedores dentro de cada docker-compose.

---

## Instalación y puesta en marcha

### 1. Crear la red Docker compartida

Este paso se hace una sola vez antes de la primera ejecución:

```
docker network create sanos-y-salvos-net
```

La red se crea con el nombre lógico `sanos-y-salvos-net`. El compose de ExpressGateway la declara con el nombre físico `mascotas_sanos-y-salvos-net`, que es el nombre que verán el resto de los servicios al referenciarla como `external`.

### 2. Levantar cada servicio

Cada servicio se levanta desde su propia carpeta. El orden recomendado es el siguiente, ya que algunos servicios dependen de la red y de RabbitMQ que provee ExpressGateway:

```
cd ExpressGateway/api-gateway
docker compose up -d --build

cd ../../ms-auth
docker compose up -d --build

cd ../ms-users
docker compose up -d --build

cd ../ms_mascotas
docker compose up -d --build

cd ../ms-soporte
docker compose up -d --build

cd ../ms-localizacion
docker compose up -d --build

cd ../ms-matching
docker compose up -d --build

cd ../ms-mensajeria-privada
docker compose up -d --build

cd ../bff_fullstack
docker compose up -d --build

cd ../frontend-sanos-salvos
docker compose up -d --build
```

Una vez levantado todo, el sistema es accesible en `http://localhost`.

### 3. Poblar la base de datos

Con todos los servicios corriendo, ejecutar desde la raíz del proyecto:

```
node seed.mjs
```

El script realiza todo en un solo comando:

- Registra 30 ciudadanos y 10 instituciones de prueba mediante el BFF
- Espera 4 segundos para que ms-auth sincronice las credenciales por RabbitMQ
- Inicia sesión con el primer ciudadano y publica 25 reportes de mascotas
- Crea 60 tickets de soporte vía el endpoint público (sin JWT), distribuidos en las categorías `problema_tecnico`, `reporte_abuso` y `otro`
- Aplica backdate por SQL directo a los contenedores de PostgreSQL para distribuir los registros en los últimos 12 meses, incluyendo distribución de estados en los tickets (`abierto`, `en_proceso`, `resuelto`, `cerrado`)
- Crea el usuario superadmin y actualiza su rol en ms-users y ms-auth directamente en las bases de datos
- Al finalizar imprime en consola todos los emails y contraseñas creados

Contraseña de ciudadanos e instituciones: `Test1234!`
Contraseña del superadmin: `Admin1234!`
Email del superadmin: `superadmin@sanos.cl`

### 4. Detener los servicios

Desde la carpeta de cada servicio:

```
docker compose down
```

Para detener y eliminar volúmenes (borrar toda la data):

```
docker compose down -v
```

---

## Variables de entorno

Cada servicio incluye un archivo `.env.example` en su carpeta. Copiar como `.env` y completar los valores antes de construir los contenedores.

### Variables compartidas críticas

| Variable | Servicios | Descripción |
|---|---|---|
| JWT_SECRET | ms-auth, ms-users, ms-mensajeria-privada, gateway.config.yml | Clave de firma de tokens JWT. En `ExpressGateway/api-gateway/config/gateway.config.yml` está hardcodeada y debe actualizarse manualmente cuando cambie. |
| INTERNAL_API_KEY | ms-auth, ms-users | Clave para el endpoint administrativo de registro de credenciales en ms-auth. |

### Variables por servicio

| Variable | Servicio | Descripción |
|---|---|---|
| CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET | ms-users | Almacenamiento de fotos de perfil de usuarios en la nube. |
| GMAIL_USER, GMAIL_APP_PASSWORD | ms-users | Envío de OTP y correos de recuperación de contraseña. |
| RESEND_API_KEY | ms-soporte | Respuestas por email a tickets enviados por usuarios no registrados. |
| UPLOAD_DIR, MAX_FILE_SIZE_MB | ms_mascotas | Directorio local para fotos de mascotas (default: `uploads/`, límite: 5 MB). |
| RABBITMQ_EXCHANGE | ms_mascotas, ms-localizacion, ms-matching | Nombre del exchange de eventos (debe ser `sanos_y_salvos_events` en todos). |
| UMBRAL_SCORE | ms-matching | Umbral mínimo de similitud para crear un match (default: `0.60`). |
| CORS_ORIGIN | ms-mensajeria-privada | Origen permitido para Socket.io (default: `*`). |
| REDIS_CACHE_URL | ms-auth | URL de Redis para el caché del endpoint `/api/auth/me`. |
| SOPORTE_URL | bff_fullstack | URL de ms-soporte (debe apuntar a `http://ms-soporte:3005` en Docker). |

---

## Documentación de APIs

Cada servicio expone documentación interactiva Swagger mientras está corriendo:

- Servicios Node.js: `http://localhost:{PUERTO}/api/docs`
- Servicios Python (FastAPI): `http://localhost:{PUERTO}/docs`

---

## Arquitectura interna de servicios

### Servicios Node.js

Todos los servicios Node.js siguen una arquitectura en capas:

```
routes → controllers → services → repositories → models (entidades TypeORM)
```

Los servicios que tienen carpeta `repositories/` (ms-users, ms_mascotas, ms-mensajeria-privada) usan el patrón Repository como única interfaz hacia TypeORM. ms-auth y ms-soporte usan el repositorio integrado de TypeORM directamente en la capa de servicio.

La carpeta `factories/` orquesta la creación de múltiples entidades en una sola operación transaccional (por ejemplo, `User` + `Ciudadano`). La carpeta `events/` publica eventos de dominio al broker sin tocar la base de datos.

### Servicios Python

ms-localizacion y ms-matching siguen la misma separación:

```
routers → services → repositories → models (modelos SQLAlchemy)
```

La carpeta `repositories/` es la única que accede a SQLAlchemy directamente. ms-matching incluye además:
- `scoring.py`: función pura de puntuación sin dependencias externas (DB ni red), completamente testeable en aislamiento.
- `evento_handler.py`: despacha eventos RabbitMQ hacia la capa de servicios.

---

## Patrones de diseño aplicados

| Patrón | Servicios |
|---|---|
| Repository | ms-users, ms_mascotas, ms-mensajeria-privada, ms-localizacion, ms-matching |
| Factory Method | UserFactory (ms-users), CredentialFactory (ms-auth), ReporteFactory (ms_mascotas) |
| Singleton | Conexiones a DB, cliente Redis, conexión RabbitMQ (MensajeriaService en ms_mascotas) |
| BFF (Backend for Frontend) | bff_fullstack — único punto de entrada HTTP hacia los microservicios |
| Event-Driven Architecture | Toda la comunicación asíncrona entre servicios vía RabbitMQ |

---

## Motor de emparejamiento

ms-matching compara el reporte entrante contra todos los reportes activos del tipo opuesto (`PERDIDA` vs `ENCONTRADA`) con la misma especie:

1. Si ambos reportes tienen chip y el código coincide: score 1.0, match aceptado automáticamente.
2. Si ambos tienen chip pero los códigos son distintos: score 0.0, match descartado.
3. Sin chip en alguno o en ambos: score ponderado con tres criterios:
   - Color: 40% — similitud Jaccard entre conjuntos de palabras del campo color.
   - Tamaño: 20% — coincidencia exacta (`PEQUEÑO`, `MEDIANO`, `GRANDE`).
   - Distancia: 40% — fórmula Haversine entre las coordenadas, máximo 50 km.

Un score mayor o igual a 0.60 (configurable con `UMBRAL_SCORE`) crea un match en estado `PENDIENTE`. El dueño del reporte de pérdida puede aceptar o rechazar el match desde el detalle del reporte. Al aceptar, se publica el evento `matching.match.aceptado` en el exchange `sanos_y_salvos_events`, que ms-mensajeria-privada consume para crear la sala de chat.

---

## Mensajería en tiempo real

ms-mensajeria-privada expone una API REST para gestión de salas y un servidor Socket.io para mensajes en tiempo real. El navegador se conecta directamente a este servicio, sin pasar por el Gateway ni el BFF.

### Autenticación

La conexión Socket.io se autentica con JWT en el campo `handshake.auth.token` o el header `Authorization`. El middleware decora el socket con un objeto `usuario` que contiene `{ id, email, role }`. Usuarios con rol `moderador`, `administrador` o `superadmin` se unen automáticamente a la room `moderadores`.

### Rooms de Socket.io

- `sala:{salaId}` — mensajes de la conversación entre los dos usuarios.
- `usuario:{userId}` — notificaciones personales (nueva coincidencia, mensaje nuevo).
- `moderadores` — alertas de salas reportadas para acción de moderación.

### Estados de una sala

`ACTIVA` → `CONGELADA` (sala reportada por un usuario) → `CLAUSURADA` (cerrada por un moderador).

---

## Sistema de autenticación

ms-auth mantiene una réplica local de credenciales en su propia base de datos PostgreSQL, sincronizada de forma asíncrona desde ms-users por RabbitMQ. Esto permite autenticar usuarios aunque ms-users esté caído. La fuente de verdad siempre es ms-users.

La entidad `Credential` en ms-auth almacena un campo `cached_data` (JSONB) con datos básicos del usuario y un array `permissions`.

El endpoint `POST /api/auth/register` (protegido por `x-api-key`) es una herramienta administrativa de emergencia. Desde la versión 2.0.0, las credenciales se crean automáticamente cuando ms-auth recibe el evento `user.registered` por RabbitMQ.

Redis se usa exclusivamente para el caché del perfil en `/api/auth/me` (`REDIS_CACHE_URL`).

---

## Roles de usuario

| Rol | Tipo | Descripción |
|---|---|---|
| ciudadano | Persona natural | Tiene RUN, nombre, apellidos y datos personales. |
| veterinaria | Institución | Tiene RUT y razón social. |
| municipalidad | Institución | Tiene RUT y razón social. |
| moderador | Empleado | Acceso al panel de administración y moderación de salas. |
| administrador | Empleado | Acceso completo al panel de administración. |
| superadmin | Empleado | Rol máximo. Se crea mediante `node seed.mjs` o actualización directa en BD. |

La validación del RUN/RUT utiliza el algoritmo módulo 11 chileno, implementado en `validarDigitoVerificador.ts` dentro de ms-users.

El modelo de usuario tiene dos subtipos: `ciudadano` (personas naturales, con campos `primer_nombre`, `segundo_nombre`, `apellido_paterno`, `apellido_materno`, `run`) e `institucion` (organizaciones, con campos `nombre_institucion`, `razon_social`, `rut`, `tipo_institucion`).

---

## Estados del dominio

| Entidad | Estados posibles |
|---|---|
| Reporte de mascota | `EN_BUSQUEDA`, `RESUELTO`, `ABANDONADO`, `OCULTO` |
| Match | `PENDIENTE`, `ACEPTADO`, `RECHAZADO` |
| Ticket de soporte | `abierto`, `en_proceso`, `resuelto`, `cerrado` |
| Sala de mensajería | `ACTIVA`, `CONGELADA`, `CLAUSURADA` |

---

## Chatbot de soporte

El chatbot usa coincidencia de palabras clave contra un archivo JSON de respuestas predefinidas (`ms-soporte/src/data/chatbot-responses.json`). No utiliza ningún modelo de lenguaje. Los temas cubiertos son: registro de cuenta, inicio de sesión, recuperación de contraseña, publicación de reportes, sistema de emparejamiento y uso del mapa.

El widget flotante del chatbot es visible únicamente para usuarios con roles `ciudadano`, `veterinaria` y `municipalidad`. Los roles de empleado (moderador, administrador, superadmin) no lo ven.

---

## Gestión de esquemas de base de datos

- Servicios Node.js: TypeORM con `synchronize: true` en desarrollo. No existen archivos de migración; el esquema se sincroniza automáticamente desde las definiciones de entidades al levantar el servicio. ms_mascotas desactiva `synchronize` en producción.
- ms-soporte: ejecuta un helper `ensureDatabase()` al arrancar que crea la base de datos si no existe.
- ms-localizacion: usa Alembic para migraciones. El entrypoint Docker ejecuta `alembic upgrade head` antes de iniciar uvicorn.
- ms-matching: usa `create_all` de SQLAlchemy al iniciar.

---

## Frontend — rutas y contextos

Las rutas están definidas en `src/App.tsx`. Componentes guard:
- `PrivateRoute` — requiere `isAuthenticated`.
- `AdminRoute` — requiere rol en `['moderador', 'administrador', 'superadmin']`.

Contextos principales:
- `AuthContext` + hook `useAuth` — estado de autenticación global.
- `AdminModeContext` — controla si un empleado tiene activo el modo administrador y la visibilidad del `AdminSidebar`.

El panel de análisis vive bajo `/admin/analisis/{usuarios,mascotas,tickets}` y usa la librería `recharts` para visualizaciones.

---

## Ejecución de pruebas

### Servicios Node.js

```
cd ms-auth && npm test
cd ms-auth && npm run test:coverage

cd ms-users && npm test
cd ms-users && npm run test:coverage

cd ms_mascotas && npm test
cd ms_mascotas && npm run test:coverage

cd ms-soporte && npm test
cd ms-soporte && npm run test:coverage

cd ms-mensajeria-privada && npm test
cd ms-mensajeria-privada && npm run test:coverage
```

El umbral mínimo de cobertura en servicios Node.js es del 70%.

### Frontend (Vitest)

```
cd frontend-sanos-salvos
npm run test:run
npm run test:coverage

# Un archivo específico
npx vitest run src/test/pages/perfil/PerfilPage.test.tsx
```

### Servicios Python (pytest, sin Docker)

```
cd ms-localizacion
python -m pytest tests/ -v
python -m pytest tests/ --cov=app --cov-report=term-missing

cd ms-matching
python -m pytest tests/ -v
python -m pytest tests/test_scoring.py -v
python -m pytest tests/test_scoring.py::TestChip::test_chip_coincidente_retorna_100_auto -v
```

Las pruebas de Python no requieren Docker: usan mocks para la base de datos y RabbitMQ.

---

## Inspección directa de bases de datos

```
# ms-auth (contenedor: ms-auth-db)
docker exec ms-auth-db psql -U postgres -d ms_auth -c "\dt"

# ms-users (contenedor: ms-users-db)
docker exec ms-users-db psql -U postgres -d ms_users -c "SELECT COUNT(*) FROM users;"

# ms_mascotas (contenedor: postgres-mascotas)
docker exec postgres-mascotas psql -U postgres -d ms_mascotas -c "SELECT COUNT(*) FROM reportes;"

# ms-soporte (contenedor: ms-soporte-db)
docker exec ms-soporte-db psql -U postgres -d ms_soporte -c "SELECT COUNT(*) FROM tickets;"

# ms-mensajeria-privada (contenedor: ms-mensajeria-privada-postgres-1, puerto 5436)
docker exec ms-mensajeria-privada-postgres-1 psql -U mensajeria_user -d mensajeria_db -c "\dt"

# ms-localizacion (contenedor interno del compose)
docker exec ms-localizacion-postgres-1 psql -U postgres -d ms_localizacion -c "\dt"
```

---

## Consideraciones de red Docker

Todos los servicios deben pertenecer a la red `mascotas_sanos-y-salvos-net`. Esta red la declara el docker-compose de ExpressGateway con nombre explícito. Los demás composes la referencian como `external: true` con el mismo nombre.

El frontend en Docker usa nginx como único punto de entrada en el puerto 80. Las reglas de proxy están en `frontend-sanos-salvos/nginx.conf`:

- `/api/mascotas/reportes` (exacto): redirige al BFF directamente (`backforfrontend:3000`), sin pasar por el Gateway, para evitar la validación JWT en el listado público.
- `/api/` (prefijo): redirige al API Gateway (`api-gateway:8080`) para todo lo demás.
- `/uploads/` (prefijo): redirige a ms-mascotas (`ms-mascotas:3003`) para servir las fotos de mascotas.
- `/salas` y `/socket.io/`: redirigen a ms-mensajeria-privada (`ms-mensajeria-privada:3006`).
- Todo lo demás sirve `index.html` para el enrutamiento de la SPA.

ms-mensajeria-privada usa el puerto 5436 (no 5432) para su PostgreSQL interna, para evitar conflictos con otros contenedores de base de datos en el mismo host.

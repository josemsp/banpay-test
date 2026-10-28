# Users REST API

REST API de gestión de usuarios con autenticación y autorización basada en roles. Construida con Hono, TypeScript, Cloudflare Workers y Supabase.

## Tecnologías

- **Hono:** framework HTTP.
- **TypeScript:** tipado estático.
- **Cloudflare Workers:** ejecución y despliegue.
- **Supabase Auth:** autenticación de usuarios.
- **Supabase PostgreSQL:** persistencia de perfiles.
- **Vitest:** pruebas automatizadas.

## Requisitos

- Node.js compatible con las dependencias del proyecto.
- pnpm.
- Una cuenta de Supabase.
- Una cuenta de Cloudflare para el despliegue.

## Instalación

Clona el repositorio y ejecuta:

```bash
pnpm install
```

Configura las variables de entorno locales en `.dev.vars`:

```dotenv
SUPABASE_URL=your_supabase_url
SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
SUPABASE_SECRET_KEY=your_supabase_secret_key
```

Sustituye los valores de ejemplo por los de tu proyecto. No subas `.dev.vars` al repositorio.

## Ejecución local

```bash
pnpm dev
```

## Documentación de la API (OpenAPI / Scalar)

La especificación OpenAPI y la interfaz interactiva están disponibles en:
- **Scalar UI interactivo:** `GET /api/docs`
- **Especificación OpenAPI (JSON):** `GET /api/v1/openapi.json`

---

## Convenciones de los Requests

### Encabezados (Headers)

- **`Content-Type: application/json`**: Obligatorio en todos los endpoints que envíen un cuerpo (payload) (`POST`, `PATCH`). Si el cuerpo no es un JSON válido, la API responderá con `400 Bad Request`.
- **`Authorization: Bearer <access_token>`**: Obligatorio en todas las rutas bajo `/api/v1/users` y `/api/v1/ghibli`. El token se obtiene al iniciar sesión en `/api/v1/auth/login`.

---

## Detalle de Endpoints y Requests

### 1. Salud del Servicio

#### `GET /health`
Comprueba la disponibilidad del servicio.

- **Autenticación:** No requerida.
- **Headers:** Ninguno.
- **Query / Body:** Ninguno.
- **Respuesta esperada (200):**
  ```json
  { "status": "ok" }
  ```

---

### 2. Autenticación

#### `POST /api/v1/auth/login`
Autentica a un usuario activo mediante sus credenciales y retorna un token JWT de sesión junto con su perfil y rol.

- **Autenticación:** Pública.
- **Headers Requeridos:**
  - `Content-Type: application/json`
- **Request Body (JSON):**
  | Campo | Tipo | Requerido | Descripción / Validación |
  | :--- | :--- | :--- | :--- |
  | `email` | `string` | Sí | Correo electrónico con formato válido, no vacío. |
  | `password` | `string` | Sí | Contraseña del usuario. |

- **Ejemplo de Request:**
  ```http
  POST /api/v1/auth/login HTTP/1.1
  Host: localhost:8787
  Content-Type: application/json

  {
    "email": "admin@test.dev",
    "password": "password123"
  }
  ```

- **Respuestas:**
  - `200 OK`: Retorna `access_token`, `refresh_token`, `expires_in` y datos del usuario (`id`, `name`, `email`, `role`).
  - `400 Bad Request`: JSON mal formado o campos vacíos.
  - `401 Unauthorized`: Credenciales erróneas.
  - `403 Forbidden`: Cuenta sin perfil o desactivada (`deleted_at` no nulo).

---

### 3. Gestión de Usuarios

> **Nota:** Todos los endpoints de usuarios requieren el encabezado `Authorization: Bearer <access_token>`. Salvo `PATCH /api/v1/users/:id`, que permite a cualquier usuario autenticado actualizar su propio nombre, el resto de endpoints requieren el rol `admin`.

#### `GET /api/v1/users`
Obtiene una lista paginada de los perfiles de usuario activos ordenados descendentemente por fecha de creación.

- **Headers:**
  - `Authorization: Bearer <token>`
- **Query Parameters:**
  | Parámetro | Tipo | Requerido | Default | Restricciones / Validación |
  | :--- | :--- | :--- | :--- | :--- |
  | `page` | `integer` | No | `1` | Número entero mayor o igual a 1. |
  | `limit` | `integer` | No | `20` | Número entero entre 1 y 100. |

- **Ejemplo de Request:**
  ```http
  GET /api/v1/users?page=1&limit=10 HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  ```

- **Respuestas:**
  - `200 OK`: Devuelve array `data` con usuarios y objeto `pagination` (`page`, `limit`, `total`, `totalPages`).
  - `400 Bad Request`: `page` < 1 o `limit` > 100 o valores no numéricos.
  - `401 / 403`: Falta de token o rol sin permisos de administrador.

---

#### `GET /api/v1/users/:id`
Consulta el perfil de un usuario activo específico.

- **Headers:**
  - `Authorization: Bearer <token>`
- **Path Parameters:**
  | Parámetro | Tipo | Descripción |
  | :--- | :--- | :--- |
  | `id` | `string` (UUID v4) | Identificador único del usuario. |

- **Ejemplo de Request:**
  ```http
  GET /api/v1/users/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  ```

- **Respuestas:**
  - `200 OK`: `{ "data": { "id": "...", "name": "...", "email": "...", "role": "...", "created_at": "...", "updated_at": "..." } }`
  - `400 Bad Request`: Si el `id` no es un UUID válido.
  - `404 Not Found`: Si el usuario no existe o está eliminado.

---

#### `POST /api/v1/users`
Crea una nueva cuenta de usuario en Supabase Auth y su respectivo registro en la tabla `profiles`. Si falla la creación del perfil, se compensa eliminando la cuenta de Auth.

- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Request Body (JSON):**
  | Campo | Tipo | Requerido | Restricciones |
  | :--- | :--- | :--- | :--- |
  | `name` | `string` | Sí | 1 a 100 caracteres (después de aplicar trim). |
  | `email` | `string` | Sí | Formato de email válido, máximo 254 caracteres. |
  | `password` | `string` | Sí | Entre 8 y 72 caracteres. |
  | `role` | `string` | Sí | Uno de: `admin`, `films`, `people`, `locations`, `species`, `vehicles`. |

- **Ejemplo de Request:**
  ```http
  POST /api/v1/users HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  Content-Type: application/json

  {
    "name": "Jane Doe",
    "email": "jane@test.dev",
    "password": "SecurePassword123!",
    "role": "films"
  }
  ```

- **Respuestas:**
  - `201 Created`: Retorna el perfil creado `{ "data": { "id": "...", ... } }`.
  - `400 Bad Request`: Si algún campo no cumple con las validaciones (retorna lista de `details` por campo).
  - `409 Conflict`: Si el email ya se encuentra registrado en una cuenta activa.

---

#### `PATCH /api/v1/users/:id`
Actualiza parcialmente el perfil de un usuario activo (`name` y/o `role`).

- **Autorización:**
  - Un usuario autenticado puede actualizar su propio `name`.
  - Solo un `admin` puede actualizar a otros usuarios y cambiar `role`.
  - Ningún usuario puede cambiar su propio `role`, ni siquiera un `admin`.
- **Headers:**
  - `Authorization: Bearer <token>`
  - `Content-Type: application/json`
- **Path Parameters:**
  | Parámetro | Tipo | Descripción |
  | :--- | :--- | :--- |
  | `id` | `string` (UUID v4) | Identificador del usuario a modificar. |
- **Request Body (JSON):**
  > Requiere al menos un campo. No permite campos adicionales no reconocidos (`strict`).
  | Campo | Tipo | Requerido | Restricciones |
  | :--- | :--- | :--- | :--- |
  | `name` | `string` | Opcional | 1 a 100 caracteres (después de trim). |
  | `role` | `string` | Opcional | Uno de los roles válidos del sistema. |

- **Ejemplo de Request:**
  ```http
  PATCH /api/v1/users/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  Content-Type: application/json

  {
    "role": "people"
  }
  ```

- **Respuestas:**
  - `200 OK`: Perfil actualizado.
  - `400 Bad Request`: `id` no es UUID, body vacío, campos extras no permitidos o datos inválidos.
  - `403 Forbidden`: Un usuario sin rol `admin` intenta modificar a otro usuario o intenta cambiar su propio `role`.
  - `404 Not Found`: Usuario inexistente o inactivo.
  - `409 Conflict`: Si se intenta degradar el rol del único administrador activo restante en el sistema.

---

#### `DELETE /api/v1/users/:id`
Elimina un usuario aplicando eliminación lógica en `profiles` (`deleted_at = now()`) y borrando la cuenta en Supabase Auth.

- **Headers:**
  - `Authorization: Bearer <token>`
- **Path Parameters:**
  | Parámetro | Tipo | Descripción |
  | :--- | :--- | :--- |
  | `id` | `string` (UUID v4) | Identificador del usuario a eliminar. |

- **Ejemplo de Request:**
  ```http
  DELETE /api/v1/users/550e8400-e29b-41d4-a716-446655440000 HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  ```

- **Respuestas:**
  - `200 OK`: `{ "message": "User deleted successfully" }`
  - `400 Bad Request`: `id` inválido.
  - `404 Not Found`: Usuario inexistente o ya eliminado.
  - `409 Conflict`: Si se intenta eliminar al único administrador activo en el sistema.

---

### 4. Proxy Studio Ghibli

Permite consultar la API externa de Studio Ghibli aplicando control de acceso basado en el rol del usuario autenticado.

#### Permisos por Rol:
| Rol | Recursos permitidos |
| :--- | :--- |
| `admin` | Todos (`films`, `people`, `locations`, `species`, `vehicles`) |
| `films` | Únicamente `films` |
| `people` | Únicamente `people` |
| `locations` | Únicamente `locations` |
| `species` | Únicamente `species` |
| `vehicles` | Únicamente `vehicles` |

---

#### `GET /api/v1/ghibli/:resource`
Consulta el listado de elementos de un recurso.

- **Headers:**
  - `Authorization: Bearer <token>`
- **Path Parameters:**
  | Parámetro | Valores permitidos |
  | :--- | :--- |
  | `resource` | `films`, `people`, `locations`, `species`, `vehicles` |
- **Query Parameters:**
  | Parámetro | Tipo | Requerido | Descripción |
  | :--- | :--- | :--- | :--- |
  | `fields` | `string` | No | Lista de campos separados por comas para filtrar la respuesta (ej. `id,title,director`). |
  | `limit` | `integer` | No | Límite de elementos devueltos (número entre 1 y 250). |

- **Ejemplo de Request:**
  ```http
  GET /api/v1/ghibli/films?fields=id,title,release_date&limit=5 HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  ```

- **Respuestas:**
  - `200 OK`: `{ "data": [ ... ] }`
  - `400 Bad Request`: `limit` fuera de rango (menor a 1 o mayor a 250).
  - `403 Forbidden`: Si el rol del usuario no tiene acceso a ese recurso.
  - `404 Not Found`: Recurso no soportado.
  - `502 Bad Gateway`: Servicio externo de Ghibli no disponible o con error de upstream.

---

#### `GET /api/v1/ghibli/:resource/:id`
Consulta un elemento específico de un recurso por su identificador.

- **Headers:**
  - `Authorization: Bearer <token>`
- **Path Parameters:**
  | Parámetro | Descripción |
  | :--- | :--- |
  | `resource` | Recurso permitido según el rol. |
  | `id` | Identificador del elemento (1 a 100 caracteres). |
- **Query Parameters:**
  | Parámetro | Tipo | Requerido | Descripción |
  | :--- | :--- | :--- | :--- |
  | `fields` | `string` | No | Campos específicos separados por coma (ej. `id,title`). |

- **Ejemplo de Request:**
  ```http
  GET /api/v1/ghibli/films/2baf70d1-42bb-4437-b551-e5fed5a87abe?fields=id,title HTTP/1.1
  Host: localhost:8787
  Authorization: Bearer eyJhbGciOi...
  ```

- **Respuestas:**
  - `200 OK`: `{ "data": { ... } }`
  - `403 Forbidden`: Sin permiso para el recurso.
  - `404 Not Found`: Si el elemento o recurso no existe.
  - `502 Bad Gateway`: Error de comunicación con la API externa.

---

## Roles del Sistema

- `admin`: Acceso total. Gestión de usuarios y todos los recursos de Ghibli.
- `films`: Lectura exclusiva de `/api/v1/ghibli/films`.
- `people`: Lectura exclusiva de `/api/v1/ghibli/people`.
- `locations`: Lectura exclusiva de `/api/v1/ghibli/locations`.
- `species`: Lectura exclusiva de `/api/v1/ghibli/species`.
- `vehicles`: Lectura exclusiva de `/api/v1/ghibli/vehicles`.

---

## Seguridad

- **Bearer Token:** Todas las rutas protegidas validan el token JWT con Supabase Auth (`supabase.auth.getUser()`).
- **Verificación en Base de Datos:** Cada petición protegida consulta el perfil activo en PostgreSQL para garantizar que el usuario no ha sido eliminado (`deleted_at is null`) y que su rol coincide con los privilegios exigidos.
- **Actualización de Perfil:** Cualquier usuario autenticado puede editar su propio nombre, pero no su propio rol. Solo un `admin` puede cambiar el rol de otros usuarios.
- **Protección de Último Administrador:** No es posible eliminar ni degradar el rol del último usuario `admin` activo del sistema.
- **Trazabilidad:** La eliminación lógica conserva el registro de perfil histórico (`deleted_at`), pero borra la cuenta en `auth.users` revocando el acceso inmediatamente y permitiendo un nuevo registro futuro con el mismo email si fuese necesario.

---

## Pruebas Automatizadas

Ejecuta la suite de pruebas completa con Vitest en el entorno de Cloudflare Workers:

```bash
pnpm test
```

Comprueba el tipado estático con TypeScript:

```bash
pnpm exec tsc --noEmit
```

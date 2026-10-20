# Seguridad de Nodara

## Qué protege el sistema

| Área | Protección |
|---|---|
| Contraseñas | scrypt con sal. Mínimo 10 caracteres, con letras y números, sin incluir el usuario. |
| Login | Límite por IP (10 por minuto y 60 por hora). Bloqueo de 15 minutos por cuenta tras 5 fallos. Misma respuesta y mismo tiempo si el usuario no existe. Cada ingreso y cada fallo quedan en Auditoría. |
| Sesiones | Token aleatorio de 256 bits; en la base solo se guarda su hash. Vencen a los 30 días. Al cambiar la contraseña se cierran las demás sesiones. |
| Permisos | Matriz de rol × módulo (ver, crear, editar, eliminar) aplicada en el servidor: API de datos, funciones, archivos y adjuntos. |
| API | Lista blanca de tablas y campos validados. Valores siempre parametrizados (sin inyección SQL). Máximo 10.000 filas por consulta. Quién hizo cada cambio lo define el servidor, no el navegador. |
| Auditoría | No se puede editar ni borrar por la API; solo depurar lo viejo desde Configuración → Datos. |
| Credenciales | Cifradas con AES-256-GCM usando `SECRETS_ENCRYPTION_KEY`. Ver o copiar un secreto queda auditado y el secreto se oculta a los 30 s. |
| Archivos | Solo carpetas permitidas y con permiso del módulo. Se rechazan tipos ejecutables (html, svg, js, exe…). Se sirven aislados (`CSP: sandbox`); los tipos no seguros, como descarga. |
| QR público | Muestra solo datos de la etiqueta (sin IP ni datos internos). Límite de reportes por IP y campo trampa contra bots. |
| PIN de escaneo | Se rechazan PIN triviales. Tras 10 PIN incorrectos el PIN se borra y hay que entrar con la contraseña. |
| Navegador | CSP, `frame-ancestors 'none'`, `X-Frame-Options`, `nosniff`, COOP/CORP, `Permissions-Policy` (solo cámara propia) y `noindex`. HSTS cuando hay HTTPS. |
| Errores | Los errores de base y del sistema no muestran tablas, columnas ni infraestructura; el detalle queda en el log del servidor. |
| Dependencias | `npm audit` en 0 vulnerabilidades (versiones corregidas fijadas en `overrides`). |

## Configuración recomendada en producción (`.env`)

```env
SECRETS_ENCRYPTION_KEY=<openssl rand -base64 48>   # obligatorio, 32+ caracteres
ALLOW_PUBLIC_SIGNUP=false
HOST=127.0.0.1          # si hay un proxy HTTPS (Caddy/Nginx) en el mismo servidor
# TRUSTED_PROXIES=10.0.0.5   # IP del proxy, si está en otra máquina
```

- **IP del cliente:** el servidor solo confía en la cabecera `X-Forwarded-For` cuando la conexión llega desde `127.0.0.1` o desde una IP de `TRUSTED_PROXIES`. Así nadie puede falsificar su IP para esquivar los límites de intentos. `TRUST_PROXY=true` confía en cualquier origen: usalo solo si el puerto de la app no es accesible desde la red.
- **Clave de cifrado:** si la instalación todavía no tenía `SECRETS_ENCRYPTION_KEY`, se puede agregar en cualquier momento. Las credenciales guardadas antes se siguen leyendo, y al editarlas se vuelven a cifrar con la clave nueva. Al arrancar, el servidor avisa en el log si falta o si es corta.
- **Exposición:** no publiques el puerto 3090 a Internet. Usalo en la red interna o detrás de una VPN, y con HTTPS (`deploy/https.sh`).

## Al arrancar

El servidor escribe avisos `[seguridad]` en el log si detecta una configuración riesgosa:

```bash
journalctl -u nodara | grep seguridad
```

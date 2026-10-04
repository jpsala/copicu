# Custodia del servicio y equipos por cuenta

Decisión de JP, 2026-10-03: usar la solución más sencilla, claves gestionadas
por nuestro servicio. El operador puede descifrar; no anunciar E2EE en este modo.
Continúan el cifrado del payload, HTTPS, firma de emisor y custodia local DPAPI.

## Identidad y recorrido

- Cualquier cuenta Google verificada puede vincular PCs. La identidad canónica
  es `issuer + sub`, nunca email. No hay equipo principal ni aprobación entre PCs.
- Cada login válido activa sólo su nueva identidad de dispositivo. Las claves
  privadas de firma, bearer y KEM permanecen en esa PC. No se transfieren entre PCs.
  Los lectores concurrentes de archivos DPAPI inmutables comparten sólo lectura
  (`FILE_SHARE_READ`); escritura y eliminación continúan excluidas durante la
  lectura, sin omitir validaciones de ruta, archivo ni identidad.
- El servicio entrega claves de contenido sólo para membresías vigentes; cada
  PC debe conectar sus carpetas y elegir direcciones. Login no envía historial,
  importa contenido ni habilita efectos Windows/Actions.
- Retirar un equipo revoca su bearer, streams y grants. Los recursos afectados
  mantienen el requisito de rotación. No se pueden borrar copias ya descargadas.

## Protocolo y almacenamiento

Reusar HPKE y sus transcripts V2. Custodia usa RFC 9180
X25519/HKDF-SHA256/AES-128-GCM, con suite explícita firmada; los paquetes legados
y el cifrado del contenido mantienen ChaCha20Poly1305. Los transcripts
Ed25519 ligados a entorno, recurso, epoch, emisor y destinatario. El servicio
publica un destinatario de custodia firmado por su identidad ya fijada. La firma
Ed25519 cubre el dominio `Copicu.shared.custody-recipient.v3\0` y el JSON canónico
de `environment`, `deviceId`, `signingPublicKey`, `kemPublicKey` y `suite`; el
host verifica esa firma contra el issuer fijado antes de depositar claves.
El host envía paquetes cifrados al servicio; nunca claves en claro al renderer, logs,
archivos de intents ni configuración pública.

Un secreto aleatorio de 32 bytes, fuera de SQLite y Git, deriva con dominios
separados la clave KEM y la clave AES-256-GCM del vault del servidor. SQLite
conserva sólo claves de contenido cifradas con AAD de entorno/recurso/epoch.
Un marcador durable fija la identidad del vault: no regenerar ni sustituir el
secreto al reiniciar. Backup/restore incluye DB, issuer, secreto de custodia y
configuración protegida; perder el secreto impide recuperar el vault.

Crear/rotar/importar claves e instalar grants comparten la transacción de la
operación. Una clave existente para un epoch es inmutable. La custodia no otorga
membresía ni elimina límites de retención, cuota, historial o revocación.
El catálogo materializa paquetes HPKE para cada PC autorizada, firmados por el
servicio y verificados por el host contra el issuer fijado. Los epochs históricos
requieren publicaciones retenidas dentro del `historyFloor` de esa persona.
La identidad de custodia nunca es un emisor de portapapeles ni un usuario.

## Migración

Un cliente actualizado que posee claves de un recurso propio deposita en el
servicio sus epochs actuales y los históricos todavía retenidos, sin modificar
claves, contenido, carpetas ni efectos. Se usa una intención firmada recuperable
con paquetes cifrados y revisión de recurso; respuesta perdida y retries no
duplican recursos ni reemplazan claves. La primera PC actualizada con las claves
permite que otras PCs de la cuenta las reciban del servicio.

Las solicitudes pendientes anteriores y vigentes se activan por la cuenta
verificada; solicitudes expiradas y equipos retirados/cancelados no se reactivan.
Recursos legados sin claves en el
vault conservan sus paquetes existentes y muestran una indicación para actualizar
la PC que posee las claves. Si no existe esa PC, el vault nuevo no puede inventarlas.
Recovery E2EE queda sólo como compatibilidad legado, fuera del recorrido normal.

Depositar una clave no reemplaza los bytes del paquete legado ya instalado para
un equipo/recurso/epoch. El servicio genera el paquete de custodia cuando falta;
los clientes actuales pueden seguir usando claves ya distribuidas durante la
transición. Esto no garantiza clientes antiguos para nuevos recursos o epochs:
actualizar todas las PCs antes de crear o rotar claves bajo custodia.

## Aceptación exigida

- Vector oficial RFC 9180 y composición bidireccional Bun/Rust HPKE real.
- Dos PCs de igual cuenta activas por OIDC, sin approve, claves de create/rotate
  disponibles en ambas; tercera PC posterior obtiene las claves sin contactar PCs.
- Separación entre cuentas/issuer, firma inválida, paquete alterado, epoch o
  destinatario incorrecto, conflicto de clave y operación perdida/repetida.
- Migración de recurso legado, pausa y retiro; recuperación de backup con el
  mismo secreto y fallo cerrado con un secreto distinto.
- Historial permitido/restringido, imágenes y texto, no backfill, no eco y efectos
  nativos cercados. UI desktop/narrow muestra vínculo, equipos iguales y custodia.
- Configuración pública de Google y servicio, release firmado para la otra PC,
  reinicio dev local. La prueba sintética no acredita dos PCs físicas.

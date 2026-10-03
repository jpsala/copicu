# Primer acceso y servicio entre PCs

Estado: implementación y aceptación local en [identity-acceptance.md](identity-acceptance.md).
JP autorizó deploy/distribución el 2026-10-02; proveedor y destino concretos son
Google y el VPS existente con Traefik, sin nueva suscripción. Confirmación puntual
de términos/credenciales, DNS e imagen de runtime pendiente. La aceptación en dos
PCs se comprueba por separado; este documento no concede permisos futuros.
Este contrato amplía el producto local sin cambiar V1/V2 ni `liveOnly`.

## Solución propuesta y fuentes

Reusar el servicio Bun/SQLite existente y poner una instancia privada detrás de
Caddy/HTTPS en un VPS aprobado, o el Traefik existente con su file provider sin
reemplazar rutas. El destino actual usa esta segunda variante. No migrar el store a Cloudflare en este corte:
su [SQLite de Durable Objects](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
requiere adaptar el runtime/almacenamiento y repetir atomicidad y SSE. Es una
alternativa, no un destino elegido ni una autorización para crear recursos.

Propuesta de proveedor: Google OIDC, con una aplicación web del servicio y una
lista explícita de cuentas admitidas. El cliente soporta el contrato OIDC del
servicio y no depende de Google ni contiene un client secret. Registrar la
aplicación/callback y obtener credenciales sigue pendiente de aprobación.
[Google documenta](https://developers.google.com/identity/openid-connect/openid-connect)
el flujo de código, discovery, state/nonce y validación de ID tokens. Se usa
`issuer + sub` para identidad; email verificado sirve sólo para la lista inicial
de admisión. No fusionar cuentas por email ni ofrecer contraseñas Copicu.

El navegador del sistema preserva la sesión del proveedor, según
[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252). PKCE S256 liga el código al
verificador según [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).
El broker usa callback HTTPS propio, state y nonce de un uso, PKCE y token
exchange en backend. El desktop usa además su propio challenge para consultar
el resultado: abrir el link en otro navegador no concede el dispositivo.

## Identidad y primer acceso

1. Settings pide URL HTTPS del servicio y nombre del equipo. Sin URL desplegada,
   explica lo que falta. Importar un bundle queda como herramienta avanzada
   para perfiles sintéticos, fuera del recorrido habitual.
2. El host genera Ed25519, HPKE X25519, bearer aleatorio y verificador local.
   DPAPI custodia secretos; SQLite guarda sólo referencias y estado durable.
   No enviar private keys/bearer al renderer ni al servicio. El alta envía
   hash del bearer y claves públicas, firmados y ligados al challenge.
3. El servicio abre sesión OIDC acotada, autentica `iss/sub` y admite la cuenta
   configurada. Verifica firma RS256/JWKS, issuer, audience/azp, exp/iat y nonce;
   ningún ID token, email ni personId suministrado por React concede identidad.
4. La primera PC de una persona crea su espacio y queda aprobada. Otra PC queda
   pendiente; puede consultar sólo su solicitud. No accede a catálogo,
   publicaciones, SSE ni ciphertext antes de aprobación o recuperación.
5. La PC ya aprobada muestra nombre y fingerprint completo de la solicitud.
   JP compara la misma huella en la otra PC y aprueba explícitamente. El host
   empaqueta únicamente claves que posee y a las que la persona conserva acceso,
   con HPKE y firma del transcript V2. El servidor valida dispositivo, persona,
   permiso, epoch, revisión y paquete antes de instalar grants.
6. La nueva PC importa paquetes sólo después del commit. El alta no crea
   conexiones, importa historial ni habilita Windows, Actions, atajos o captura.
   Se guía a Crear/conectar con el selector existente; se conserva el draft.

El login sin terminar dura diez minutos; solicitudes de equipo, 24 horas.
El resultado de un login completado persiste ligado al dispositivo y requiere
la prueba local firmada para recuperarse después de offline/restart. No reabre
el navegador ni extiende aprobación pendiente; retiro/cancelación invalidan el
acceso. IDs y secretos son aleatorios, los límites son finitos y los retries usan IDs persistidos.
Respuesta perdida no crea una segunda persona/equipo. Cancelar invalida la
solicitud; reiniciar conserva el estado. Error de red permite Retry; denied,
expirado, proveedor mal configurado y clave pendiente se explican por separado.

## Equipos, creación y retiro

El catálogo de servicio real expone sólo personas relacionadas por acceso o
invitación y dispositivos pertinentes. No publicar un directorio de cuentas.
Un nuevo recurso distribuye su key a equipos ya aprobados de la misma persona;
no necesita ampliar audiencia ni revisión de remitentes automáticos.

Las aprobaciones incluyen una revisión de cuenta y los heads/epochs observados.
Si cambian durante el empaquetado, fallan con conflicto recuperable. Una clave
no disponible permanece pendiente, sin inventar grants. Retirar equipo revoca
bearer/grants/paquetes y cancela streams. Recursos propios quedan con rotación
pendiente; no se promete eliminar texto ni claves descargadas. Retirar el equipo
actual invalida sus efectos y conserva copias locales. No reasignar identidad
ni reactivar conexiones/efectos por volver a iniciar sesión.
Revincular un perfil retirado exige el mismo servicio/issuer y cuenta; otro
servicio/cuenta requiere un perfil nuevo. El ledger de receipts/replay se conserva
pausado, con generación invalidada y sin restaurar destinos o efectos antiguos.

## Recuperación E2EE

La persona genera explícitamente un código aleatorio de 256 bits y lo guarda
fuera de Copicu. Sirve como seed Ed25519 de recuperación y, por derivación con
dominio separado, como clave XChaCha20Poly1305 del snapshot de claves. No es una
contraseña ni un token de dispositivo. El servicio recibe public key y snapshot
cifrado, con identidad/entorno/servicio como AAD; nunca el código ni keys en claro.
La UI muestra el código sólo por intención explícita y no lo copia al clipboard.

El equipo que posee ese código actualiza el snapshot al cambiar las claves.
Snapshots tienen revisión monotónica; el último snapshot puede carecer de keys
de recursos creados en otro equipo hasta una actualización. Mostrar esa limitación.
Recuperar requiere login OIDC de la misma persona y prueba firmada con el código,
ligada a la nueva identidad/challenge/revisión. La PC descifra localmente e instala
sólo claves que coinciden con recursos/epochs todavía autorizados. Recuperar
retira los equipos anteriores y exige revisar/rotar antes de reanudar envío.
Ni login solo ni el operador del servicio recuperan contenido. Sin equipo
aprobado ni código guardado, las claves no son recuperables; no resetear en silencio.

## Servicio y operación revisables

Entrypoint separado del fixture: configuración validada, issuer Ed25519 durable,
SQLite persistente, lista cerrada de admisión, HTTPS público, callback exacto,
timeouts/límites, no CORS público, health sin identidad y shutdown limpio.
El servicio escucha loopback detrás del proxy; no confía en headers de identidad
ni registra cuerpos, bearer, códigos OIDC, links, email o contenido de clipboard.
No aceptar HTTP remoto; loopback sólo con opt-in sintético en tests/debug.

Artefactos: configuración de ejemplo sin secretos, Dockerfile sin instalación
local, proxy y guía de arranque/backup/rollback. Backup debe conservar issuer,
DB/WAL y ciphertext juntos; no es backup del historial desktop.
No ejecutar deploy, descargar imágenes, abrir cuentas, usar credenciales
encontradas ni tocar un VPS como consecuencia de preparar estos archivos.

## Aceptación y límites

- OIDC sintético con claves reales: state/nonce/PKCE, claims/JWKS, denegación,
  expiración, cancelación, retry/restart y ausencia de secretos en respuestas.
- Dos perfiles nuevos con host real: primer login, segunda PC pendiente,
  fingerprint/aprobación/HPKE, create en ambas direcciones, conexiones explícitas,
  texto Unicode, offline, pausa/reanudación, retiro y recuperación.
- Regresiones V1/V2/SSE, outbox/leases/receipts y fences de identidad. No reducir
  ticks, modificar live leases ni activar efectos nativos durante onboarding.
- UI real, teclado, narrow, errores y regreso al selector; build normal y reload
  sólo de la dev propia, con PID/ruta/perfil/marker/opt-ins revalidados.
- Servicio HTTPS remoto y dos PCs físicas tienen gates/evidencia separados.
  Ningún fixture local ni paquete preparado acredita esos resultados.

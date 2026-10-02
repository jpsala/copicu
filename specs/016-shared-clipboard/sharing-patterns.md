# Patrones de colaboración para Copicu

Investigación del 2026-10-02, solicitada por JP antes de implementar.
Fuentes públicas primarias; consulta sin datos, código ni credenciales del proyecto.
Las analogías orientan diseño, no acreditan seguridad ni integración de Copicu.
Recomendaciones propias se distinguen de comportamiento documentado.

## Analogías seleccionadas

| Referencia y evidencia | Aplicación propuesta a Copicu | Límite |
| --- | --- | --- |
| [Syncthing: direcciones de carpeta](https://github.com/syncthing/docs/blob/main/users/foldertypes.rst) documenta send/receive, send-only y receive-only. | Elegir dirección en el lugar donde trabaja la persona; un recurso remoto admite destinos locales diferentes. | Syncthing replica cambios de archivos y tiene resolución de conflictos. Copicu conserva publicaciones inmutables y no copia esas reglas de borrado/edición. |
| [Dropbox: permisos](https://help.dropbox.com/share/set-file-folder-permissions) diferencia propietario, editor y lector. [Salir](https://help.dropbox.com/share/leave-shared-folder) y [quitar acceso](https://help.dropbox.com/share/unshare-folder) son operaciones distintas. | Propiedad y acceso visibles, con acciones específicas para conexión local, participación y eliminación remota. | Las copias locales de Copicu no se borran como réplica de una operación remota. Dirección local y permiso remoto son ejes distintos. |
| [Signal: group links](https://support.signal.org/hc/en-us/articles/360051086971-Group-Link-or-QR-code) ofrece link/QR, aprobación opcional y desactivación/reset de links. | Incorporación por invitación con estados y aprobación; abrir un link no configura Windows ni una carpeta. | Es analogía de interacción. No se importa su protocolo ni se afirma ocultación de membresía equivalente a Signal. |
| [ntfy: API](https://docs.ntfy.sh/subscribe/api/) permite suscribir por HTTP/WebSocket y recuperar cache por cursor/tiempo; [configuración](https://docs.ntfy.sh/config/#access-control) ofrece usuarios, ACL y tokens. | Un mismo recurso sirve a interfaz, scripts y consumidores independientes. Recuperación e historial se separan de efectos en vivo. | Los nombres de topic no son credenciales de Copicu. No adoptar acceso abierto ni colocar texto en claro en un relay externo. |
| [Slack: canales](https://slack.com/help/articles/205239967-Join-a-channel) distingue incorporación a canales privados; [Slack Connect](https://slack.com/help/articles/360049769934-Accept-a-Slack-Connect-channel-invitation) hace revisar una invitación entre espacios. | Catálogo de recursos propios/autorizados y aceptación con contexto de propietario, sin mezclar espacios personales. | No construir un chat, organizaciones, roles de empresa ni navegación de workspace en el primer corte. |
| [Apple: Universal Clipboard](https://support.apple.com/en-gb/102430) comparte contenido brevemente entre dispositivos próximos de la misma cuenta. | Automatización personal discreta con pocos pasos, como preset futuro de alcance explícito. | La disponibilidad efímera y la cuenta única no cubren historial, personas, scripts ni servidor de Copicu. |

Las filas resumen hechos documentados y proponen inferencias. Ninguna obliga a
instalar o integrar estos productos; no se recomiendan como backend por analogía.

## Opciones de producto contrastadas

| Modelo | Ventaja | Coste / riesgo | Decisión propuesta |
| --- | --- | --- | --- |
| Réplica de carpeta completa | Organización y ediciones compartidas automáticamente. | Conflictos, borrados propagados, tags/rutas ajenos y dedupe global; excede el pedido confirmado. | Diferir como otro contrato. |
| Clipboard global entre dispositivos | Fricción mínima en el caso personal. | Publica demasiado por defecto y compite con copia local/Windows; no ofrece historial ni control de audiencia. | Automatización opcional de un recurso explícito, no comportamiento inicial. |
| Recurso de publicaciones con historial + conexiones locales | Funciona desde carpeta, vista, atajo y API; cada equipo elige efectos. | Requiere separar historial, acceso y llegada nueva sin exponer jerga. | Modelo recomendado. |
| Buzón sin lectura | Muchas personas pueden entregar texto sin ver entradas de otras. | Una clave simétrica compartida para leer/escribir no prueba aislamiento criptográfico; necesita otro esquema. | Buena ampliación posterior. |
| Colección de referencias conservadas indefinidamente | Biblioteca común útil para proyectos. | Retención ilimitada/backup/versionado, más costes y expectativa de edición. | Usar guardado local y retención visible; evaluar biblioteca por separado. |

## Mejoras de mayor valor por complejidad

1. Vista compartida sin obligación de carpeta: consulta/copia/guardado explícito.
2. Selector único en conexión, Enviar a… y configuración de destino de Action.
3. Recursos personales por defecto, invitación independiente y propietario visible.
4. Recibir en carpetas distintas en cada equipo sin igualar árboles locales.
5. Historial disponible independiente de importación y de efectos sobre Windows.
6. Estado de envío honesto y destinos de automatización visibles por equipo.

Ampliaciones creativas con utilidad concreta:

- Recurso temporal para una sesión de trabajo o pairing, con expiración del recurso
  y su invitación; no confundirla con la frescura de Windows.
- Una carpeta local de recopilación con varias salidas explícitas y scripts que
  producen versiones transformadas para distintos destinatarios.
- Un Action reusable de Limpiar y enviar, cuyo destino se elige en interfaz.
- Un buzón de entregas para que varias personas aporten texto sin leer otros aportes,
  una vez resuelto el aislamiento de claves.
- Una vista de actividad que explica qué equipo guardó o aplicó el envío; no inventar
  confirmación de lectura ni presencia por mera conexión al servidor.

## Casos que las analogías no resuelven

- Agregar una persona amplía audiencia de carpetas/scripts que ya enviaban solos.
  Propuesta: revisión y pausa de automatismos afectados, preservando el caso de
  agregar un equipo de la misma persona.
- Crear remoto y conectar local no tiene transacción única. Resolver respuestas
  perdidas con operation ID y estado Creado; falta conectar.
- Dos carpetas receptoras del mismo perfil compiten con un clip globalmente único.
  Propuesta inicial: una entrada automática por canal/perfil, feed independiente.
- A → B → A puede convertirse en bucle aunque ninguna regla de carpeta reenvíe.
  Forwarding por scripts necesita causalidad y límites además de provenance actual.
- Una nueva persona con acceso sólo futuro requiere separación de epochs; un permiso
  de servidor aislado no garantiza que una clave ya compartida no descifre lo previo.
- Un dispositivo autenticado puede carecer de claves históricas. Login, vinculación
  de dispositivo y recuperación de contenido son estados distintos.
- Retirar acceso o eliminar no puede recuperar bytes ya descargados ni efectos ya
  iniciados. Servidor bloquea nuevas admisiones; host invalida al observar el cambio
  y limita efectos con leases. No prometer interrupción remota instantánea.

## Referencias de autenticación nativa

[RFC 8252](https://www.rfc-editor.org/rfc/rfc8252) prescribe navegador externo y PKCE
para clientes nativos OAuth. [RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
especifica el challenge S256. Propuesta: seguir ese patrón cuando se seleccione
proveedor de autenticación, conservando claves E2EE bajo custodia propia.
Esto no selecciona proveedor, hace login ni acredita la vinculación de claves.

## Resultado del análisis

La potencia viene de un recurso estable usable por varias entradas y salidas,
con acceso comprensible y automatización opt-in. La simplicidad viene de un
recorrido básico de selector + dirección, información contextual y defaults que
no publican historial ni activan Windows. Los contratos y tareas revisados están
en [plan.md](plan.md) y [tasks.md](tasks.md).

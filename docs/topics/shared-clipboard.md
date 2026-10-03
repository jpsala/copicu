---
title: Clipboard compartido y backup futuro
summary: "Sharing local con OIDC, equipos/recovery E2EE, acceso histórico y SSE; despliegue y dos PCs pendientes."
keywords:
  - clipboard compartido
  - shared clipboard
  - portapapeles compartido
  - cloud clipboard
  - suscripciones
  - sincronizacion entre equipos
  - backup cloud
---

# Clipboard compartido y backup futuro

Runtime, host Windows, UI y SDK están implementados y validados localmente con
personas/equipos sintéticos; incluye prueba instalada ↔ dev y SSE S1–S6.
Q1 `liveOnly`, Q2 texto plano y Q3 espacios propios por persona siguen vigentes.
Primer acceso OIDC y recovery E2EE están implementados con aceptación local;
proveedor/cuentas, despliegue HTTPS y aceptación en dos PCs permanecen abiertos.
Estado de la candidata, próximo paso y evidencia en
[track 041](../tracks/041-shared-clipboard.md) y
[aceptación local](../../specs/016-shared-clipboard/local-acceptance.md).

La capacidad se compila por defecto, pero sharing sigue apagado en un perfil
sin configurar: no inicializa tablas auxiliares ni transporte de sharing ni
publica sus copias. Una conexión explícita determina el flujo; Windows y Actions
mantienen opt-ins propios. El corte anterior está incluido en el NSIS firmado
`v0.5.2-rc.1`, core `0.5.2`; estado de publicación/instalación en el track y
[evidencia del artefacto](../../specs/016-shared-clipboard/local-acceptance.md#candidata-firmada-v052-rc1-2026-10-02).
El primer acceso posterior todavía requiere publicar/instalar el cliente.

## Primer acceso y equipos

Settings → Sharing pide servicio/nombre y abre el navegador del sistema.
OIDC prueba la cuenta; una segunda PC espera comparación de huella y aprobación
para recibir claves HPKE. Login, crear recurso y aprobar un equipo no conectan
carpetas ni importan historial ni habilitan efectos. Secretos permanecen en DPAPI;
el servidor conserva hashes, claves públicas y ciphertext.
El login sin terminar expira a los diez minutos; un resultado ya confirmado se
recupera con prueba local firmada tras offline/restart. Esto no reabre el login,
extiende la aprobación pendiente de 24 horas ni recupera acceso retirado.

Recuperar exige esa cuenta y el código aleatorio guardado fuera de Copicu.
Restaura claves disponibles en el snapshot cifrado, retira equipos anteriores y
exige rotación antes de enviar. No es backup del historial local. Sin equipo
aprobado ni código, login u operador no recuperan las claves.

Revincular un perfil retirado exige su cuenta/servicio/issuer original: conservar
receipts/replay y copias locales, invalidar generaciones y empezar sin conexiones
o efectos previos. Shutdown cerca requests a ambos lados de la ruta async,
deja cerrar los bodies SSE y después cierra servidor/SQLite.

[Contrato](../../specs/016-shared-clipboard/identity-service-plan.md),
[evidencia local](../../specs/016-shared-clipboard/identity-acceptance.md) y
[operación del servicio](../../scripts/shared-clipboard/README.md).

## Identidades, conexiones y efectos

- Recurso compartido, carpeta local y clip deduplicado tienen identidades distintas.
  Publicaciones son inmutables; reintentos del host conservan su ID. Renombrar una
  carpeta o recurso no cambia el destino configurado.
- Una conexión explícita puede enviar, recibir o ambas desde una carpeta exacta,
  Root o All history. El scope general se elige en Settings: Todo Copicu o Sólo
  textos sin carpeta. El envío general admite ingresos locales nuevos al perfil;
  mover un clip existente no crea ese ingreso. Una conexión de carpeta exacta con
  envío habilitado sí publica entradas locales efectivas por movimiento al destino,
  además de las capturas/creaciones nuevas. No incluye descendientes. El
  solapamiento general/carpeta al mismo canal se admite una vez por ingreso.
- Conectar, habilitar o reanudar no publica/importa el contenido previo. Consultar
  historial autorizado no conecta, importa, escribe Windows ni ejecuta Actions.
  Guardar o copiar una publicación constituye una intención separada.
  Mover al mismo destino, recapturar un duplicado sin ingreso nuevo o editar
  contenido/metadata por sí solo no publica. Un movimiento de origen remoto
  tampoco publica, aunque entre a una carpeta emisora.
- Recepción, guardado local, escritor built-in de Windows y Action de recepción
  tienen controles independientes. Los efectos requieren opt-in; sólo un escritor
  automático por perfil. `liveOnly` excluye recuperaciones/replay y el intervalo
  pausado de los efectos automáticos. Una copia local, pausa, expiración o cambio
  de generación invalida la escritura pendiente.
- Origen remoto se conserva aunque se transforme, guarde o copie: no dispara
  republicación automática. Forwarding exige grants explícitos y admite un solo
  salto firmado; no hay routing ilimitado ni ejecución remota de scripts.

Invitaciones, aceptación y aprobación validan cada equipo y transfieren paquetes
HPKE. Acceso al historial anterior requiere permiso y claves del rango/epoch
concedido; autenticar a una persona o conocer un cursor no concede ese acceso.
Agregar lectores sin historial requiere epoch nuevo. Revocación bloquea grants
antes de rotar y no borra contenido que ya se descargó. Si falta una clave, la
recepción queda pendiente visible, sin tratarla como texto vacío ni llegada live.
Claves y bearer permanecen en host/custodia DPAPI, fuera del renderer y del runner.

Actions expone destino configurado (`target`/`publish`), estado local (`state`),
historial paginado con scope de contenido (`history`) y recepción inmutable
(`received`). Enviar confirma admisión local de cola, no recepción en otro equipo;
la consulta de estado no transforma una observación local en ACK remoto.
Contrato y scopes en [Actions](actions-and-scripting-api.md).

## Sincronización SSE

HTTP confirma cambios; el backend guarda estado, resultado idempotente y eventos
mínimos en la misma transacción; SSE despierta reconciliación por cursor/snapshot.
El listener vive por perfil, independiente de ventanas. La UI recibe invalidaciones
saneadas y Library, selector y Settings actualizan sin perder borradores, selección
o foco. Retiro conserva la conexión y copias locales y bloquea controles del recurso.

El cursor de control se liga a persona/entorno/generación y se persiste después de
aplicar el snapshot autorizado. Es independiente de delivery, historia y Windows.
Snapshots tardíos de otra identidad/pausa no restauran config/grants/cursor.
Denied cancela el stream y revoca acceso sin fallback; unsupported reconcilia a
baja frecuencia. Replay revalida acceso y no expone metadata retirada.

Los hints mínimos de head sólo despiertan el sync V1: no invalidan catálogo ni
avanzan control water. El sync existente revalida contenido, acceso, leases y
fences. Ticks de outbox/retención/fallback, receipts, `liveOnly` y opt-ins se
conservan. Reducir polling requiere medición y regresiones propias.
Contrato y matriz en [sse-sync-plan.md](../../specs/016-shared-clipboard/sse-sync-plan.md);
cierre local en [aceptación SSE](../../specs/016-shared-clipboard/local-acceptance.md#aceptacion-sse-local-2026-10-02).

## Fuentes y límites

- [Spec](../../specs/016-shared-clipboard/spec.md) y
  [plan](../../specs/016-shared-clipboard/plan.md): requisitos, arquitectura,
  APIs vigentes, defaults concretados para el fixture y propuestas remotas.
- [Implementación local](../../specs/016-shared-clipboard/local-implementation.md):
  runtime, SQL, HTTP/cifrado y contratos de integración; conserva aprobación
  específica de dependencias y límites históricos sin transferir permisos.
- [N1](../../specs/016-shared-clipboard/n1-native-custody.md): matrices sintéticas
  nativas/custodia. Correlacionar el writer después de `CloseClipboard`, bajo
  nueva exclusión con owner/marker/sequence estable. Una window station tiene
  su propio clipboard; otro desktop/carpeta no lo aísla. HWND/marker públicos
  no autentican apps hostiles del mismo usuario.
- [Actions](actions-and-scripting-api.md): grants de envío/recepción/historia,
  consulta local de estado y límites del runner de confianza.
- [Preflight](../../specs/016-shared-clipboard/research.md): procedencia de las
  evaluaciones iniciales; no es el estado actual de implementación o distribución.

El primer objetivo sigue siendo Trabajo ↔ Casa, sin compartir indiscriminadamente
el historial ni pegar/enfocar ventanas por recibir. Backup puede reutilizar
identidad/custodia/almacenamiento, pero necesita retención y recuperación propias.
Drive, imágenes/HTML, publicación automática por tags y sincronización de
ediciones/borrados/carpetas quedan fuera de este corte. Compartir por carpeta
exacta sí pertenece al producto local implementado.

## Procedencia documental

Entrada importada del principal el 2026-10-01; propuesta inicial conservada en
spec/plan/preflight. Actualizada al contrato local del 2026-10-02. Pruebas locales,
resultados nativos, servicio remoto y artefactos de release tienen evidencias
separadas; documentos y autorizaciones históricas no conceden permisos actuales.

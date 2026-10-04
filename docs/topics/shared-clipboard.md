---
title: Clipboard compartido y backup futuro
summary: "Sharing de texto e imágenes con servicio interno; cuenta Google canónica, PCs iguales y claves gestionadas por el servicio."
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
Q1 `liveOnly` y Q3 espacios propios por persona siguen vigentes. JP amplió Q2 de
texto plano a texto e imágenes; archivos se posponen.
El servicio de custodia está activo y el cliente `v0.5.6` está publicado como
stable/latest, con firma, downloads y updater verificados. Hasta `v0.5.5` el cliente distribuía el flujo
legado de aprobación/recovery. JP reportó uso y autenticación entre Casa y Trabajo,
y aprobación pendiente en la notebook. Ese reporte no identifica la versión o
el modo de claves de cada PC ni sustituye la aceptación sintética física.
Actualizar y abrir primero una PC existente para migrar claves, y luego las demás
con la misma cuenta Google. Actualizar todas antes de crear recursos o rotar claves.
Estado distribuido, próximo paso y evidencia en
[track 041](../tracks/041-shared-clipboard.md) y
[aceptación de custodia](../../specs/016-shared-clipboard/custody-acceptance.md).

La capacidad se compila por defecto, pero sharing sigue apagado en un perfil
sin configurar: no inicializa tablas auxiliares ni transporte de sharing ni
publica sus copias. Una conexión explícita determina el flujo; Windows y Actions
mantienen opt-ins propios. El corte anterior está incluido en el NSIS firmado
`v0.5.2-rc.1`, core `0.5.2`; estado de publicación/instalación en el track y
[evidencia del artefacto](../../specs/016-shared-clipboard/local-acceptance.md#candidata-firmada-v052-rc1-2026-10-02).
El primer acceso está distribuido en `v0.5.3`; sus evidencias se conservan separadas
de cambios posteriores al tag.

## Primer acceso y equipos

El endpoint de producto es único e interno: `https://sharing.jpsala.dev/`.
Desde `v0.5.4` el cliente sólo pide nombre de PC y navegador; muestra el endpoint en
errores de conexión. Un override técnico requiere debug/tests y loopback literal,
sin campo editable ni hosts remotos alternativos. La política definida por JP
admite cualquier cuenta Google autenticada, identificada por `issuer + sub`, con
sus PCs al mismo nivel y sin aprobación ni transferencia de claves entre ellas.
JP eligió el 2026-10-03 claves gestionadas por nuestro servicio para que baste
el login, sin código o secreto personal adicional. Aceptó que el operador puede
descifrar: este modo no promete E2EE. El servicio conserva claves de contenido
cifradas en su vault y entrega paquetes HPKE sólo a PCs con acceso vigente;
las claves privadas de cada PC y su bearer permanecen en el host bajo DPAPI.
Login y custodia no conectan carpetas, importan historial ni habilitan efectos.
[Contrato y migración](../../specs/016-shared-clipboard/service-key-custody.md).
Validación, distribución y aceptación física se distinguen en el track.

**Compatibilidad legada.** El flujo de equipos de `v0.5.3` a `v0.5.5`
incluye aprobación; `v0.5.4` ya fija la URL interna. El corte de custodia conserva
la admisión OIDC/Google existente: la cuenta de JP puede vincular la notebook,
pero abrir Audience/admisión general queda fuera de este corte.
En el flujo legado, OIDC prueba la cuenta; una segunda PC espera huella y aprobación
para recibir claves HPKE. Login, crear recurso y aprobar un equipo no conectan
carpetas ni importan historial ni habilitan efectos. Secretos permanecen en DPAPI;
el servidor conserva hashes, claves públicas y ciphertext.
El login sin terminar expira a los diez minutos; un resultado ya confirmado se
recupera con prueba local firmada tras offline/restart. Esto no reabre el login,
extiende la aprobación pendiente de 24 horas ni recupera acceso retirado.

Recuperar en el modo legado exige esa cuenta y el código aleatorio guardado fuera de Copicu.
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

## Contenido compartido

Texto e imágenes conservan tipo bajo cifrado autenticado (`TXT1`/`IMG1`). La
imagen se normaliza a PNG, se guarda en blobs deduplicados y muestra miniatura;
copiarla en Windows publica PNG y DIBV5 con alpha. Máximo PNG: 25 MiB y 4096 ×
4096 px. HTML, RTF, OLE y formatos privados requieren captura/persistencia propia;
archivos quedan para después. Actions de recepción siguen procesando sólo texto.

Actualizar el servicio y ambas PCs antes de enviar imágenes: clientes anteriores
pueden rechazar páginas grandes y demorar textos posteriores. Conectar no envía
clips previos; la procedencia remota impide eco. Colas, pausas, retención, permisos,
leases y cercos del escritor se conservan. Las transferencias demoradas no habilitan
efectos automáticos fuera de `liveOnly`. [Contrato](../../specs/016-shared-clipboard/media-plan.md)
y [aceptación](../../specs/016-shared-clipboard/media-acceptance.md).

## Identidades, conexiones y efectos

- Recurso compartido, carpeta local y clip deduplicado tienen identidades distintas.
  Publicaciones son inmutables; reintentos del host conservan su ID. Renombrar una
  carpeta o recurso no cambia el destino configurado.
- Una conexión explícita puede enviar, recibir o ambas desde una carpeta exacta,
  Root o All history. El scope general se elige en Settings: Todo Copicu o Sólo
  clips sin carpeta. El envío general admite ingresos locales nuevos al perfil;
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

La membresía de una persona determina acceso al recurso; vincular una PC a su
cuenta no concede membresías nuevas. En el contrato de custodia, el servicio
entrega paquetes HPKE a sus PCs autorizadas; el legado conserva aprobación y
paquetes entre equipos sólo para compatibilidad/migración.
Acceso al historial anterior requiere permiso y claves del rango/epoch
concedido; autenticar a una persona o conocer un cursor no concede ese acceso.
Agregar lectores sin historial requiere epoch nuevo. Revocación bloquea grants
antes de rotar y no borra contenido que ya se descargó. Si falta una clave, la
recepción queda pendiente visible, sin tratarla como texto vacío ni llegada live.
Claves descargadas, claves privadas de la PC y bearer permanecen bajo DPAPI,
fuera del renderer y del runner; el servicio custodia claves de contenido cifradas.

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
Drive, HTML/RTF, archivos, publicación automática por tags y sincronización de
ediciones/borrados/carpetas quedan fuera de este corte. Compartir por carpeta
exacta sí pertenece al producto local implementado.

## Procedencia documental

Entrada importada del principal el 2026-10-01; propuesta inicial conservada en
spec/plan/preflight. Custodia actualizada por decisión directa de JP en esta
conversación el 2026-10-03; reemplaza el requisito de aprobación/secreto E2EE
del recorrido normal, conservado como legado para migración. Pruebas locales,
resultados nativos, servicio remoto y artefactos de release tienen evidencias
separadas; documentos y autorizaciones históricas no conceden permisos actuales.

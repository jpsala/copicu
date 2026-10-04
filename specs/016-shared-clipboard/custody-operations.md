# Operación de custodia del servicio

Operación del contrato [service-key-custody.md](service-key-custody.md).
Estos comandos no conceden autorización para producción.

## Activación y secreto durable

La configuración versión 2 exige `custodyKeyPath`, separado de issuer, client
secret y SQLite. Crear una sola vez con la imagen Bun ya fijada:
`bun /app/service.mjs --init-custody /private/copicu-custody.key`, en un directorio
privado escribible para ese paso. El proceso normal monta ese secreto read-only.
El archivo contiene 32 bytes aleatorios, modo 0600, propietario del servicio;
su directorio debe ser 0700. No mostrarlo, enviarlo a Git ni regenerarlo al arrancar.
Ambos ejemplos Compose y la configuración de ejemplo incluyen su mount.

Antes de activar versión 2, hacer backup consistente con el helper
`scripts/shared-clipboard/deploy/backup.mjs` en un contenedor aislado:
`--network none --read-only --user 1000 --cap-drop ALL --security-opt no-new-privileges`,
datos `/data:ro`, privados `/config:ro` y directorio nuevo `/backup`.
El helper copia DB mediante `VACUUM INTO`, verifica integridad y correspondencia
de entorno/issuer/secreto de custodia con sus marcadores y preserva issuer,
configuración, client secret y secreto de custodia cuando la versión lo exige.
Conservar su ruta `/app/deploy/backup.mjs` y los módulos de servicio en `/app`;
sus imports resuelven desde el directorio padre.
No registra datos ni valores de claves. Mantener el backup privado y comprobar
restore en un volumen aislado antes de considerarlo recuperable.

## Restore y rollback

- Restore de custodia requiere la DB y exactamente su secreto, issuer y config.
  Cambiar el secreto falla con identidad de vault distinta; no resetear ese fallo.
- Un rollback a servicio legado requiere también la DB/config del backup previo
  a la activación. La versión nueva no permite abrir una DB de custodia sin secreto.
  No restaurar un backup por encima de producción sin plan de corte: perdería
  operaciones posteriores al snapshot.
- Migración no reemplaza claves existentes, conexiones ni copias locales. Abrir
  una PC actualizada que ya posee claves permite depositarlas en el vault. Una
  PC nueva no puede recuperar claves que nunca fueron depositadas.
  Los paquetes legados ya instalados se conservan; actualizar todas las PCs
  antes de crear recursos o rotar epochs con el servicio de custodia.
- Google debe admitir cualquier cuenta verificada y Audience estar publicada.
  No ampliar scopes: `openid` y `userinfo.email` son los ya autorizados.
  Activar `oidc.admission: "authenticated"` en el servicio y publicar Google
  Audience son pasos distintos; verificar ambos sin inferir uno del otro.
- Confirmar HTTPS, issuer original, `deviceApproval:false`, `recovery:false`,
  `keyCustody:service`, endpoints privados sin bearer 401 y límites del relay.

La prueba local de backup/restore usa identidades y bases sintéticas. El deploy
y restore remotos comprobados se registran en
[custody-acceptance.md](custody-acceptance.md#servicio-de-custodia-desplegado).
Nuevas operaciones requieren su propia evidencia y autorización.

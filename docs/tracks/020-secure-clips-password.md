---
title: Clips seguros y password
status: paused
summary: Propuesta aparcada de cifrado local, preview redacted y recuperación bajo password, sin implementar un password manager.
last_worked: null
next: Si se retoma con alcance propio, definir spec, modelo de desbloqueo y pruebas de no exposición de plaintext antes de implementar.
topics: [actions-and-scripting-api, sqlite-storage, clipboard]
---

# Secure Clips / Password Metadata

**Importación OS2:** UTC histórica desconocida; `null` conserva estudio/propuestas anteriores sin inventar progreso. Metadata original:

```yaml
id: secure-clips-password
status: parked
updated: 2026-06-29
```

Se mantiene aparcado como `paused`. Las ideas de metadata/password son tentativas, no una implementación segura acreditada ni permiso para usar secretos reales, modificar DB o iniciar un vault.

Track para pensar `guardar/recuperar con password`. Por ahora queda **parked**: es potente, pero toca seguridad, cifrado, metadata y UX sensible.

## Idea

Permitir que un clip se convierta en **secure clip**: contenido cifrado localmente, preview redacted, metadata visible y recuperacion bajo password.

No plantearlo inicialmente como password manager completo. Pensarlo como vault local liviano para clips sensibles.

## Metadata Como Contrato

JP propuso que esto debe depender de metadata. `@pass` indica que el item requiere password/cifrado, pero `@pass` solo no alcanza: hace falta metadata para buscar/identificar sin revelar contenido.

Formato tentativo:

```text
@pass github-personal
@user jp
@url github.com
@hint token fine-grained
#secret #github
```

Visible/searchable:

- nombre/alias (`@pass github-personal`);
- usuario (`@user`);
- URL/dominio (`@url`);
- pista no sensible (`@hint`);
- tags (`#secret`, `#github`).

Oculto/cifrado:

- password;
- token;
- recovery codes;
- notas privadas sensibles.

## UX Posible

### Seal Clip

1. Usuario edita metadata y agrega `@pass ...`.
2. Accion `Seal secure clip` aparece en Quick Actions/menu.
3. Copicu pide vault password/password de item.
4. Cifra el contenido.
5. Reemplaza preview por algo tipo `🔒 github-personal`, `user: jp`, `hint: token fine-grained`.

### Unlock

Acciones sobre secure clip:

- `Unlock and copy`;
- `Unlock and paste`;
- `Reveal for 15 seconds`;
- `Rotate / replace secret`;
- `Clear secure clipboard after 30s`;
- `Delete secure clip`.

## Modelo De Seguridad Tentativo

No guardar password. Derivar key desde password usando KDF.

Payload tentativo:

```text
secure_payload
- version
- kdf argon2id|pbkdf2
- salt
- nonce
- ciphertext
- auth_tag
```

Crates posibles en Rust:

- `argon2` para KDF;
- `aes-gcm` o `chacha20poly1305` para cifrado autenticado.

## Storage Tentativo

Preferencia: tabla separada para no mezclar todo en `clipboard_items`.

```text
secure_items
- clipboard_item_id
- kdf
- salt
- nonce
- ciphertext_blob_path
- created_at
- last_unlocked_at
- unlock_count
```

El `clipboard_item` queda como shell metadata/searchable, con preview redacted.

## Modelos De Password

### Opcion A: Password Por Item

Pros:

- mas portable;
- blast radius chico.

Contras:

- molesto;
- dificil de recordar;
- peor UX.

### Opcion B: Vault Password

Pros:

- mas usable;
- permite unlock temporal.

Contras:

- requiere sesion desbloqueada;
- mas responsabilidad sobre memoria/timeout.

Preferencia inicial: **vault password**, con unlock corto y lock manual.

## Riesgos / Gotchas

- No prometer seguridad de password manager sin auditoria.
- No dejar plaintext en DB, logs, diagnostics, toasts ni previews.
- Cuidado con clipboard: si se copia un secreto, limpiar despues de N segundos opcionalmente.
- Cuidado con search: solo metadata no sensible debe indexarse.
- Si secure clips entran en Paste Queue, pedir unlock justo a tiempo.
- UX de perdida de password: si no hay recovery, no se puede recuperar.

## Preguntas Abiertas

- ¿Vault password o password por item para v1?
- ¿`@pass` debe sellar automaticamente al guardar metadata o requiere accion explicita?
- ¿Cuanto dura una sesion desbloqueada?
- ¿Se permite reveal en pantalla o solo copy/paste?
- ¿Como limpiar clipboard sin borrar algo que el usuario copio despues?

## Proximo Corte Recomendado

Si se retoma: crear spec antes de implementar. Primer slice seguro:

1. parser de metadata `@pass`, `@user`, `@url`, `@hint`;
2. UI redacted para items marcados `@pass`;
3. accion manual `Seal secure clip`;
4. `Unlock and copy` con prompt;
5. tests para asegurar que plaintext no aparece en preview/log/resultados.

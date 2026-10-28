# Reglas de trabajo

Leer antes de tocar nada: `OBJETIVO.md` y `ESTADO.md`.

## Autorización actual

24/10/2026: Sebastián pidió expresamente a Codex auditar y corregir este proyecto existente, probar WhatsApp oficial y preparar guardia.grok.me. Esta sesión modifica únicamente los archivos registrados en ESTADO.md; no crea otro proyecto. No se habilitan avisos automáticos.

26/10/2026: Sebastián autoriza expresamente **reclamos automáticos por correo de los cronogramas mensuales**, una vez por día desde cuatro días antes del inicio del mes. Se detienen al identificar la planilla recibida de ese servicio y mes; la interfaz mantiene Suspender reclamo y permite cambiar el correo del responsable. Esta autorización reemplaza la prohibición anterior sólo para estos reclamos. No habilita avisos de clima, envíos automáticos por WhatsApp ni otras comunicaciones. Los destinatarios salen de los remitentes anteriores del servicio o de una corrección explícita hecha desde Cambiar datos.

26/10/2026: ante la consulta específica por el tránsito de los datos personales de empleados a través de Cloudflare, Sebastián respondió **"autorizo"**. Se habilita por 24 horas un enlace público de Cloudflare limitado a la ficha `/mis-datos` y sus rutas públicas, guardando las respuestas en esta PC, con el túnel y el pasamanos en segundo plano. No se publica la app completa ni datos clínicos de pacientes.

26/10/2026: a la pregunta directa por **enviar a OpenAI la imagen de la planilla de guardias de UCCyQ de octubre para leer los nombres de los médicos y sus días dentro del límite configurado**, Sebastián respondió **"Sí, autorizo esa planilla"**. Se registra la autorización por la huella del adjunto en `var/ai/schedule-pdf-approvals.json`; sólo ese PDF escaneado habilita la nueva extracción de su JPEG original para el lector de IA. La transcripción queda en caché y no se vuelve a pagar por la misma imagen.

## Una sola herramienta (antecedente)

- **Esta carpeta la modifica una sola herramienta: Claude.** Decisión de Sebastián del 5/10/2026: trabajar con dos a la vez generaba versiones cruzadas e instrucciones contradictorias.
- ChatGPT u otra herramienta puede usarse para consultar o comparar ideas, pero no edita archivos de esta carpeta, no hace `git` acá y sus propuestas no cambian `OBJETIVO.md`.
- Si alguna vez se suma otra herramienta, primero se escribe acá qué archivos toca cada una.

## Una sola versión

- **La fuente es la carpeta de la PC del hospital** (`schestakow-libre`). Ahí corre la app.
- **El repositorio de GitHub es su espejo.** Se actualiza desde esa carpeta. No se edita código directo en GitHub ni se suben zips.
- Un cambio existe cuando está en la carpeta, probado, y anotado en el registro de `ESTADO.md`.

## Qué nunca se sube

Credenciales, claves, sesiones (`server/session.secret`, `server/*.clixml`, `server/users.local.json`, `.env`), la carpeta `var/`, y los datos reales de pacientes y personal (`src/data/catalog.json`, `internacion.json`, `lab-pacientes.json`, `legajos.json`, `staff.json`, `inbox.json`, `mail-sync.json`). El `.gitignore` ya los excluye: no forzar su inclusión.

Por eso el repositorio tiene el código completo pero no arranca solo: los datos y las claves viven únicamente en la PC del hospital.

## Cómo se hace un cambio

1. Decir a qué punto de `OBJETIVO.md` responde y verificar que el punto del que depende ya anda. Si no, no se hace.
2. Leer `ESTADO.md` y su registro de cambios.
3. Guardar copia del archivo original en `_backups/<fecha>-<tema>/` antes de modificarlo.
4. Cambiar lo mínimo necesario. Nunca reescribir entero `server/app.mjs`, `server/start.mjs`, `scripts/start-secure.ps1` ni `package.json`.
5. Probar. Las pruebas internas pueden usar datos ficticios; lo que se le muestra al usuario, nunca.
6. Actualizar `ESTADO.md` separando **comprobado en la PC real**, **probado fuera de la PC**, **sin probar**, y agregar una línea al registro: fecha, archivos tocados, qué se probó, si hace falta reiniciar.
7. Si el cambio toca el servidor o las pantallas, hace falta reiniciar (`REINICIAR-SERVIDOR.cmd`); decirlo.
8. No se borra nada sin pedirlo. Lo que sobra se anota y lo decide Sebastián.

## Decisiones que son sólo de Sebastián

- Enviar imágenes o datos de pacientes a un servicio externo.
- Activar cualquier consumo pago.
- Eliminar la cuenta de WhatsApp del 260 405 6998 o registrar el número en Meta.
- Proveedor, dominio y publicación con datos reales.
- Enviar un mensaje real a personal del hospital.

## Comandos de verificación

```
npm run typecheck
npm test
python -m unittest discover -s scripts -p "test_*.py"
npm run build
```

## Honestidad

No escribir "completado" ni "funciona" sin haberlo visto funcionar con datos reales. Que exista el botón, compile o diga "API activa" no es prueba. Decir qué se probó, cómo, y qué limitación queda.

27/10/2026: a la pregunta especifica por mantener la misma direccion publica de la ficha del personal activa hasta que el usuario pida cerrarla, limitada a esa ficha y sin publicar app completa ni pacientes, Sebastian respondio: "Si, mantenerlo activo hasta que yo pida cerrarlo". Esta autorizacion reemplaza el limite anterior de24horas para ese mismo enlace y alcance. Se puede retirar el cierre por horario preservando los procesos del servidor, pasamanos y tunel. Sigue siendo un tunel temporal que depende de la PC/conexion, no un dominio permanente ni una garantia ante cortes o reinicios.

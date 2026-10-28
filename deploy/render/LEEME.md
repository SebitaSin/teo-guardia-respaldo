# Guardia: preparacion de Render

Esta carpeta contiene codigo y la interfaz compilada. No contiene usuarios reales,
credenciales, sesiones de WhatsApp ni datos de pacientes/personal. No es una copia
de respaldo completa ni una app operativa hasta importar su informacion privada.

## Despliegue propuesto

### Desde el repositorio de GitHub

El Dockerfile original de esta carpeta sirve solo para el paquete precompilado.
Para compilar desde GitHub usar `deploy/render/Dockerfile.github` con el contexto
en la raiz del repositorio. Ese archivo instala las dependencias de compilacion,
ejecuta el empaquetador y copia solo su salida limpia a la imagen final.

Formulario New Web Service:
- Language: Docker.
- Branch: despliegue-render.
- Root Directory: vacio.
- Dockerfile Path: deploy/render/Dockerfile.github.
- Docker Build Context Directory: raiz del repositorio (vacio si el formulario
  ya usa la raiz por defecto; no apuntar a deploy/render).
- Docker Command: vacio; se usa el CMD del archivo.
- Health Check Path: /api/health.
- Disco: /var/data, 2 GB; requiere instancia de pago.

La imagen inicia en preparacion. No cargar claves todavia para este primer
despliegue. Verificar health con operational:false; esto comprueba solo la
infraestructura y no constituye la habilitacion de la aplicacion ni sus datos.

Un servicio Docker con Node 24 y Python 3, una instancia, disco persistente de 2 GB
en `/var/data`, direccion HTTPS del proveedor y despliegues manuales.
Plan propuesto `0.5c-512mb`: 7 USD/mes + 0,50 USD/mes por disco, sujeto a confirmar
en la cuenta antes de contratar; trafico excedente, impuestos y APIs externos aparte.
Los 512 MB deben comprobarse con la carga real antes de aprobar produccion.
No se requiere contratar PostgreSQL para los archivos/SQLite actuales.

`GUARDIA_MODE=preparacion` mantiene una pagina de preparacion sin iniciar correo,
IA, lectura de pizarras, laboratorio ni mensajes. `/api/health` declara expresamente
`operational:false`. Un despliegue en este modo NO certifica funcionamiento de Guardia.

## Importacion y activacion pendientes

1. Conservar el servicio local y el enlace del personal mientras se prepara Render.
2. Transferir por un canal autenticado directamente al disco privado de Render:
   - copia consistente de `var/` a `/var/data/runtime` (SQLite mediante su API de backup);
   - siete JSON privados de `src/data/` a `/var/data/private/baseline`;
   - `ai-config`, `autogestion-config`, `avisos-config`, `reclamos-config` y
     `photo-names` a `/var/data/private/config`;
   - `users.local.json` a `/var/data/private/users.local.json`.
3. Preservar exactamente `APP_SESSION_SECRET`, que tambien cifra contactos,
   domicilios y mensajes. Cargar claves en secretos del proveedor. Exportar DPAPI
   desde la PC original; esos archivos cifrados de Windows no se abren en Linux.
   Revisar tambien laboratorio: su credencial local no esta incluida en este codigo.
4. Reescribir y verificar las rutas Windows a adjuntos/capturas en los JSON y SQLite
   de la COPIA. Confirmar descifrado, conteos y huellas antes de activar el destino.
5. Coordinar un corte breve: detener tareas/escrituras del origen, hacer la copia
   final incorporando respuestas nuevas y activar UN SOLO origen de datos.
   El enlace del personal ya distribuido necesita seguir apuntando al mismo origen
   de datos; resolver su continuidad antes de retirar el servidor original.
6. Solo tras las verificaciones, crear `migration-verified.json` en el directorio
   privado con `sourceBackgroundStopped`, `pathsConverted`, `dataValidated` en true
   y `sessionSecretSha256` calculado desde la clave original, sin registrar la clave.
   No usar este marcador para sustituir las comprobaciones reales.
7. Cambiar `GUARDIA_MODE=produccion`, habilitar correo con `GMAIL_SYNC_MINUTES=1440`
   y restaurar la configuracion de IA aprobada. La propuesta mantiene IA y correo
   deshabilitados hasta el traspaso. No se habilitan avisos ni envios nuevos.

## Comprobaciones de entrega

Login, datos privados, mapa, consulta del correo, lectura de planilla, escritura y
persistencia tras reinicio, ausencia de duplicacion de reclamos, respaldo/restauracion
y acceso desde otra red. Google requiere admitir el nuevo dominio y, si corresponde,
las IP del servidor. Laboratorio debe ser accesible desde Render.

El codigo actual inicia solo WhatsApp Cloud API oficial y deja deshabilitado el
programador de envios. No se puede presentar una sesion de WhatsApp Web conservada
en el disco como una integracion Cloud API operativa. Falta verificar recepcion/envio
real y aclarar los tres mensajes diarios antes de habilitar automatizacion.

Fuentes de la propuesta: https://render.com/pricing y
https://render.com/docs/blueprint-spec (consultadas el 28/10/2026).

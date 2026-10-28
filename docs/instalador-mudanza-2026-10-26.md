# Instalador y mudanza de Guardia Schestakow

Responde al punto 8 de OBJETIVO.md y al pedido de Sebastián: trasladar la app a otra PC, instalar lo necesario con un asistente y poder mantenerla desde casa.

## Entrega

`outputs/Guardia-Instalador/EMPEZAR.cmd` y ZIP de la carpeta completa. `LEEME.txt` contiene la secuencia para una persona sin conocimientos técnicos. El instalador es de carpeta con asistente PowerShell; no es un MSI propio firmado.

Incluye aplicación compilada, Node 24.22.1 x64, Python 3.14.10 embebido, pypdf/xlrd, Pillow 13, Cloudflared, redistribuible de Visual C++, instalador de Chrome y host de Chrome Remote Desktop. El destino no necesita npm ni compilar. Las instalaciones de Microsoft/Google exigen firma Authenticode válida del fabricante. Node se verifica contra SHASUMS oficial, Python y Pillow contra SHA256 publicado. Un manifiesto verifica cada archivo y el ZIP se audita íntegro. No es una firma independiente del paquete.

Fuentes oficiales: [Node](https://nodejs.org/dist/v24.22.1/), [Python](https://www.python.org/downloads/release/python-31410/), [control remoto de Google](https://support.google.com/chrome/answer/1649523), [túnel de Cloudflare](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/).

## Qué hace y qué requiere intervención

El asistente revisa Windows, CPU x64, memoria, espacio, archivos y runtimes; prepara carpeta privada en ProgramData, importa datos, protege claves en el destino y configura tarea al arranque como SYSTEM. El proceso mantiene el equipo despierto mientras corre y Windows vuelve a intentarlo si el supervisor falla. No modifica políticas de cierre de tapa ni puede impedir cortes de luz/red.

El modo de mudanza definitiva se ejecuta en el origen con su usuario original. Abre sus credenciales DPAPI, autentica que el servidor local corresponde a esa carpeta, pide una frase de respaldo, detiene servidor/sincronizador/enlace asociados y archiva `var`, JSON privados y configuración permitida en AES-256-GCM con scrypt y compresión. No guarda secretos en argumentos ni crea un archivo de contraseñas en claro. Copia incompleta o frase incorrecta no restauran archivos. La importación verifica la autenticación antes de extraer y no permite rutas fuera del destino ni enlaces. Reescribe referencias al directorio anterior en JSON no cifrados y tabla de adjuntos de SQLite. Comprueba que la clave original abre los almacenes cifrados.

La activación exige origen detenido; no se ejecutan simultáneamente dos remitentes de reclamos. Las copias de respaldo se restauran sólo con confirmación de origen fuera de servicio. Las actualizaciones conservan datos/claves y guardan versión anterior privada; requieren comprobar salud y pantallas después. No se promete reparación o reversión automática de cualquier falla.

Debe hacerlo Sebastián: aceptar el permiso de Windows; elegir/guardar frase de respaldo; entrar a su cuenta de Google, registrar PC y PIN; registrar dominio y autorizar su cuenta Cloudflare. Cloudflare crea túnel y DNS después de esa autorización. El script conserva certificados existentes y no reemplaza DNS ocupado. Se registra tarea del túnel. No se compra ni se publica nada al construir este paquete.

Vista/7/8/8.1, 32 bits y ARM no se admiten. No se formatea ni se actualiza el sistema operativo automáticamente. Windows 10 necesita soporte de seguridad vigente; preferible Windows 11 compatible. Si el hardware no lo admite, preparar Linux con respaldo es otro trabajo, no una función de este instalador.

## Verificado acá

- Runtimes incluidos: Node inicia y Python importa SSL, SQLite, compresión, PDF, Excel e imágenes.
- 49 pruebas de Python pasan con la versión embebida, sin envíos reales.
- Seis pruebas de archivo cifrado: restauración binaria, preservación de clave/estado, contraseña incorrecta, alteración, rutas y sobreescritura.
- Seis casos internos de rechazo: Vista/7/8/8.1, 32 bits y RAM insuficiente. No equivalen a ensayos físicos en esos sistemas.
- Windows PowerShell 5.1 ejecutó exportación/importación ficticia por tubería. Se corrigió incompatibilidad con `StandardInputEncoding` de .NET Framework usando bytes UTF-8.
- Preflight real en Windows 11, manifiesto, ACL privada y DPAPI con secreto ficticio.
- Firmas válidas de Microsoft y Google en los tres instaladores descargados.
- Copia aislada, puerto dinámico, sin credenciales ni datos reales: health, login, ficha pública y script, bloqueo sin sesión, bootstrap autenticado y retirada de GPS.
- Lectura local de cinco almacenes cifrados del origen con su clave original, sin escribirlos ni mostrar nombres. Al comprobar había 218 fichas guardadas; la cifra puede seguir aumentando.
- El paquete final excluye datos privados, credenciales y el script histórico manual del parte. La versión preliminar se conserva sólo en respaldo privado. El ZIP final se verifica contra su manifiesto.

## Pendiente en destino

Instalación y UAC en la otra PC; reinicio físico y tarea SYSTEM; importación real; registro y prueba del control remoto desde casa; dominio/DNS/certificado/túnel; entrega y persistencia de una ficha desde otra red; prueba de lectura de correo/planillas, laboratorio, Maps y WhatsApp. Presencia de una clave no demuestra validez del servicio: migrar no renueva tokens ni autoriza dominios automáticamente en Google/Meta. No se compran servicios ni se mandan mensajes de prueba al personal.

La app actual y el enlace del personal siguen activos. No se hizo la mudanza definitiva, no se instalaron servicios remotos en esta PC y no se requiere reiniciar el servidor actual por esta entrega.

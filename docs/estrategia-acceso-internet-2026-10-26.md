# Estrategia para usar Guardia Schestakow por internet

26 de octubre de 2026. Plan de trabajo basado en la instalación real de esta PC. Responde al punto 8 de OBJETIVO.md y a las dependencias de los puntos 1 a 5. Es una estrategia preparada; todavía no es una publicación de la plataforma completa.

## Resultado que buscamos

Una dirección fija para entrar desde el teléfono o una computadora, con usuario propio, datos conservados y funcionamiento continuo. En ese mismo dominio, `/mis-datos` permite que el personal actualice su ficha sin entrar a las pantallas clínicas. El dominio definitivo debe pertenecer a una cuenta administrada por el hospital o por Sebastián.

El acceso por internet y el funcionamiento de las integraciones se comprueban por separado. Que abra la pantalla de ingreso no demuestra que entren las pizarras, se actualice el laboratorio o salgan mensajes de WhatsApp.

## Ajuste por equipo disponible y presupuesto

Sebastián confirmó que todavía no tiene servidor contratado ni dominio, dispone de **otra computadora** y cuenta con poco dinero. Inicialmente señaló Windows 10 u 11 y después aclaró que podría ser Windows 8 o Vista. El sistema y los recursos del equipo de destino siguen sin comprobar.

La propuesta actual es aprovechar esa computadora como servidor dedicado, con un sistema mantenido, un dominio propio y un túnel administrado. Se evita el alquiler mensual de un VPS en esta primera etapa. El gasto nuevo para el acceso fijo sería principalmente el dominio, con renovación periódica; siguen existiendo electricidad, internet, respaldos y cualquier consumo autorizado de IA o mapas. El precio de registro y renovación del dominio se confirma antes de comprarlo; no se ha contratado nada. [Aranceles oficiales de NIC Argentina](https://nic.ar/dominios/aranceles).

Cloudflare documenta que no se necesita un plan pago de Access para publicar una aplicación mediante Tunnel. Se evaluará la modalidad gratuita y sus límites para este uso. [Aplicaciones publicadas mediante Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/).

**Si el equipo tiene Vista, Windows 8 u 8.1, no se propone usar esa instalación como servidor de la plataforma.** Son sistemas sin soporte. Se evalúa un Linux liviano con soporte vigente si el procesador, memoria, disco y compatibilidad del programa lo permiten. No se propone formatear ni comprar piezas antes de identificar el equipo, respaldar sus archivos y comprobar la alternativa. [Microsoft: Vista](https://learn.microsoft.com/en-us/lifecycle/products/windows-vista), [Microsoft: Windows 8 y 8.1](https://learn.microsoft.com/en-us/lifecycle/faq/windows).

Se preparó `outputs/Revisar-computadora-Guardia.zip`: contiene sólo un iniciador, un revisor PowerShell y sus instrucciones. Al extraerlo y abrir `REVISAR-EQUIPO.cmd` en la otra PC, consulta sistema, procesador, capacidad de 64 bits, RAM y espacio libre, y escribe `REVISION-EQUIPO-GUARDIA.txt` en el Escritorio. No lee datos de la plataforma, documentos, claves ni información clínica; no instala programas ni cambia configuración. Si no hay PowerShell, explica cómo obtener los datos desde Propiedades. La sintaxis evita funciones modernas para facilitar el uso en PowerShell antiguo; sólo se probó su ejecución en la PC actual con Windows 11, no en Vista u 8 ni en el equipo de destino. El informe no certifica salud del disco ni aptitud para servidor.

Después de comprobar el equipo, la instalación incluirá arranque de la aplicación y del túnel al encenderla, recuperación ante cierre inesperado, control de suspensión y copia recuperable fuera del disco principal. En Windows, la app debe ejecutarse con la identidad que pueda abrir sus credenciales protegidas; en Linux se preparan credenciales del entorno final. Los archivos DPAPI de esta PC no se trasladan simplemente copiándolos, pero debe conservarse la clave de cifrado de los datos.

La PC servidor y su conexión deberán permanecer encendidas. El dominio fijo permite volver a entrar con la misma dirección al recuperarse el servicio, pero no mantiene disponible una computadora apagada o sin internet. Se prueba el reinicio real antes de depender de ella.

## Arquitectura recomendada

**La otra PC como servidor dedicado, dominio fijo, una sola instalación principal y respaldo independiente**, sujeto a comprobar el equipo y su sistema. El navegador se conecta por HTTPS; detrás quedan el servidor Node, los lectores Python, los datos persistentes y las tareas de correo. La aplicación y el lector de correo deben ejecutarse continuamente. Un servidor alquilado queda como alternativa posterior si el equipo o la continuidad del hospital resultan insuficientes.

| Alternativa | Qué permite | Dependencia que queda |
|---|---|---|
| Servidor de internet aprobado por el hospital, con dominio fijo | Acceso y procesos centrales independientes de esta PC | Proveedor, red del servidor, integraciones externas y cualquier fuente que siga siendo local |
| PC dedicada en el hospital, con dominio fijo y túnel administrado | Acceso remoto manteniendo la información principal en el hospital | Electricidad, conexión, equipo y arranque automático del hospital |

Con el presupuesto declarado se prioriza la segunda alternativa. Una vez trasladada la plataforma a la PC dedicada, se puede apagar la computadora de este chat sin detenerla; la PC dedicada sí debe seguir encendida. El servidor de internet sería una etapa posterior si se necesita independencia de la electricidad o conexión del lugar donde quede el equipo.

Si ya existe un VPS de Hostinger, su administrador de Docker admite Compose, datos persistentes y políticas de reinicio. Hay que comprobar el producto contratado y sus recursos antes de elegirlo; un archivo ZIP preparado para Hostinger no demuestra que exista un servidor contratado ni que esté instalado. [Documentación oficial de Hostinger](https://www.hostinger.com/support/12040815-how-to-deploy-your-first-container-with-hostinger-docker-manager/).

Para la alternativa local, un túnel administrado puede asociar el dominio a la app del hospital y ejecutarse como servicio. Requiere dominio, cuenta y equipo conectado. [Documentación oficial de Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/get-started/).

## Qué está comprobado hoy

Consultas a la app activa el 26/10/2026, sin enviar mensajes ni cambiar fichas. El correo informó una sincronización completa a las 13:43 de Buenos Aires.

| Función | Evidencia actual | Trabajo antes de darla por operativa en internet |
|---|---|---|
| Plataforma local | `/api/health` responde 200 | Probar ingreso, permisos, guardado y reinicio en el servidor definitivo |
| Cronogramas y correo | 101 documentos leídos, un adjunto sin leer; correo completo | Validar IMAP y una planilla nueva desde el servidor elegido |
| Reclamos por correo | Habilitados, primer ciclo previsto desde el 28/10 | Trasladar estado, correos y suspensiones; dejar un solo proceso encargado de enviar |
| Actualización del personal | Formulario temporal público comprobado y pruebas de guardado aprobadas | Enlace fijo, recepción desde celular y comprobación del dato guardado con una persona autorizada |
| IA | Configurada y habilitada en la app actual | Conservar límites, caché, autorizaciones y credencial; probar el flujo autorizado en el destino |
| Mapa | Clave del navegador configurada; recorridos del servidor sin configurar | Autorizar el dominio definitivo y configurar geocodificación y recorridos; comprobar respuestas reales |
| WhatsApp | La app activa informa `configured: false` y `canSend: false` | Completar configuración y permisos de Meta, verificar webhook y realizar una prueba expresamente autorizada |
| Fotos de pizarras | El receptor usa una carpeta de Windows; existe la carpeta por defecto, pero no una carpeta de origen configurada | Comprobar de dónde llega cada foto y cómo llegará al servidor; la existencia de la carpeta no demuestra recepción automática |
| Laboratorio | Hay configuración de consulta a un destino HTTPS | Comprobar autenticación y consulta desde la red del servidor; configuración presente no demuestra disponibilidad |

La interfaz de camas y el funcionamiento clínico conservan sus pendientes propios: UCO está limitada a seis camas; la conciliación general del resto continúa pendiente de aprobación. Publicar la app no resuelve automáticamente esas diferencias, ni implementa las funciones de cobertura que aún no están completas.

## Orden de ejecución

### 1. Elegir dirección y lugar de instalación

Primero identificar la otra PC y elegir un sistema mantenido compatible. Después elegir y registrar un dominio bajo control de Sebastián o del hospital, confirmar el costo de registro y renovación y configurar la cuenta que lo administrará. Usar un subdominio para la plataforma y mantener `/mis-datos` como dirección del formulario del personal. Revisar capacidad, ubicación del equipo, almacenamiento y respaldo antes de trasladar datos reales.

La comparación no requiere enviar contraseñas por el chat. La instalación utilizará las cuentas del responsable y un medio protegido para las credenciales.

### 2. Preparar la instalación y el respaldo

Se conserva el programa actual, con los cambios registrados. Preparar un paquete de código separado de los datos privados y las credenciales. Registrar su versión y la forma de volver a la anterior.

Respaldar de forma coherente la carpeta de datos, las fuentes privadas y la configuración necesaria. Guardar también la misma clave de cifrado que usa esta instalación: sin ella no se recuperan contactos, domicilios ni mensajes cifrados. La clave y el respaldo deben tener protección y acceso controlado, con una copia recuperable fuera de este equipo.

La preparación de Docker necesita correcciones antes de usarse con información real. Los hallazgos concretos están al final de este documento. Primero se valida una instalación aislada con datos de prueba, incluido el reinicio y la recuperación.

### 3. Instalar una sola plataforma principal

Usar almacenamiento persistente, HTTPS, arranque automático y supervisión. Una dirección pública válida puede servirse con el proxy Caddy ya previsto en el proyecto, que administra y renueva sus certificados cuando se cumplen los requisitos de dominio, red y almacenamiento. [Documentación oficial de Caddy](https://caddyserver.com/docs/automatic-https).

Configurar cuentas individuales y comprobar en el servidor qué puede consultar y modificar cada rol. Revisar también los datos enviados por las respuestas de la aplicación: ocultar un botón no alcanza para restringir información.

El formulario público debe permitir únicamente su propio flujo. Sin sesión, no deben quedar disponibles las pantallas clínicas, los catálogos privados, las fotos ni las fichas completas del personal.

### 4. Conectar y probar cada función

- **Correo:** conservar historial, adjuntos, identificaciones, responsables corregidos, suspensiones y registro de reclamos enviados. Probar recepción y lectura sin generar correos de prueba a terceros.
- **Mapa:** separar la clave del navegador de la del servidor. Restringir la primera al dominio elegido y la segunda según el servidor y las API utilizadas. Configurar límites de consumo y verificar carga del mapa, domicilio conocido y recorrido. [Recomendaciones oficiales de Google Maps](https://developers.google.com/maps/api-security-best-practices).
- **WhatsApp:** validar número, credencial, permisos y recepción firmada en el webhook del dominio definitivo. Comprobar con los grupos y mensajes reales qué entrada de fotos está efectivamente disponible; el código usa Cloud API oficial y no inicia el receptor vinculado anterior. La prueba de envío requiere un destinatario y una autorización concretos. La habilitación de reclamos por correo no habilita envíos automáticos de WhatsApp.
- **Pizarras:** elegir un ingreso que llegue al servidor: recepción efectivamente validada por WhatsApp, carga autenticada desde el teléfono o un conector del hospital. Si sigue dependiendo de una PC para obtener fotos, el tablero puede permanecer accesible con esa PC apagada, pero no recibirá fotos nuevas desde ella. Debe mostrarse la antigüedad de la fuente.
- **Laboratorio:** comprobar acceso desde el servidor nuevo. Si la red de destino impide esa consulta, definir un enlace privado o conector dentro del hospital; no abrir directamente el sistema del laboratorio a internet.
- **IA:** mantener autorizaciones por tipo de documento, límites de gasto y reutilización de lecturas guardadas. Cambiar el lugar de alojamiento no amplía las autorizaciones de envío de datos.

### 5. Hacer el cambio sin dividir la información

Durante la preparación sigue funcionando la instalación actual. Para el cambio definitivo se acuerda una pausa breve de escritura, se realiza la última copia coherente y se comprueba la apertura de los datos en el destino.

Antes de activar los reclamos en el servidor nuevo se detiene el programador de la PC anterior. Nunca deben quedar dos instalaciones reclamando el mismo mes o recibiendo fichas como dos bases independientes. El formulario temporal también participa del corte: hay que incorporar sus últimas respuestas y pasar a compartir la dirección fija.

La PC anterior se conserva como recuperación controlada. Sólo se reactiva como principal después de detener la instalación remota y determinar qué cambios deben recuperarse; no se propone mantener dos copias editables en paralelo.

### 6. Aceptar la instalación por resultados

| Prueba | Resultado necesario |
|---|---|
| Teléfono con datos móviles, fuera del wifi de la PC | Abre la dirección fija, permite ingresar y muestra información actual |
| Acceso sin sesión | Sólo funcionan el formulario y las rutas públicas previstas |
| Roles distintos | Cada cuenta obtiene sólo las consultas y acciones autorizadas |
| Actualización de una ficha autorizada | El dato llega a la instalación principal, se visualiza y persiste al reiniciar |
| Nueva planilla de correo | Se identifica su servicio y mes; se lee o queda pendiente con motivo; la llegada detiene el reclamo que corresponda |
| Reclamos | Respeta suspensión y correo corregido; existe un único programador; no duplica lo ya enviado |
| Foto de pizarra autorizada | Llega por el camino elegido, se identifica y se contrasta con la referencia; no aumenta las camas del servicio |
| Mapa y recorridos | Carga el mapa y responde una búsqueda y un recorrido reales autorizados |
| Laboratorio | Obtiene una consulta real autorizada desde el lugar definitivo |
| WhatsApp | Se verifican recepción y entrega de la prueba autorizada; no basta con que el botón diga enviado |
| Reinicio del servidor | La aplicación vuelve sola y conserva datos, fichas, pendientes y estado de tareas |
| Apagado de esta PC, si se eligió servidor remoto | La plataforma central, el correo y la ficha siguen funcionando; se comprueban aparte las fuentes que todavía sean locales |
| Apagado de la PC de este chat, si se eligió la otra PC como servidor | La otra PC sigue atendiendo la dirección fija, guardando fichas y revisando el correo; se comprueba que no haya tareas duplicadas en la PC anterior |
| Recuperación | Se restaura un respaldo en una instalación aislada y se pueden abrir los datos cifrados |

Como objetivos a acordar, propongo respaldo de datos al menos cada hora, copia diaria independiente y una recuperación ensayada. La frecuencia, retención y tiempo de recuperación se ajustan al servidor y al funcionamiento real; aún no hay un servicio de respaldo remoto comprobado.

## Hallazgos técnicos que hay que corregir antes de publicar

1. **Separación de credenciales:** `deploy/Dockerfile` copia `server/` a la imagen. `.dockerignore` excluye las credenciales `.clixml`, el usuario principal y la clave de sesión, pero no cubre `server/lab-credential.local.txt` ni el respaldo `users.local.json.bak-*` que existe en la carpeta. Esos archivos no deben entrar en una imagen o paquete de distribución. No se construyó ni subió una imagen durante esta revisión.
2. **Fuentes privadas dentro de la imagen:** Docker copia `src/data` al producto. Separar esos datos en una entrada privada protegida y verificar las rutas de lectura del servidor. Un registro de imágenes público no es un destino para esa imagen con información real.
3. **Configuración incompleta para migrar todo:** `scripts/exportar-env.mjs` exporta las credenciales principales, pero no incluye `LAB_BASE_URL`, `LAB_LOGIN`, `LAB_PASSWORD` ni una estrategia para `PIZARRAS_FOLDER`. Los archivos DPAPI de Windows no se convierten en credenciales válidas de Linux por copiarlos.
4. **Configuración de proxy desactualizada:** `deploy/Caddyfile` conserva `geolocation=(self)` y `Referrer-Policy: same-origin`, mientras que la app retiró Compartir GPS y utiliza otra política de referencia. Hay que alinear las cabeceras efectivas y comprobar que no impidan la validación del dominio en Google Maps. No se comprobó ese proxy en producción.
5. **Guía anterior con datos históricos:** `deploy/README.md` todavía describe datos privados compilados en las pantallas y un estado de publicación del 5/10. El proyecto actual tiene un cargador de datos privados en ejecución; validar el paquete real y actualizar la guía antes de seguirla.
6. **Persistencia y operación:** inventariar no sólo `var`, sino fuentes privadas, usuarios, clave de cifrado, configuraciones, referencias de camas y nombres y permisos de lectura de PDF. Revisar permisos de archivos, actualización segura y recuperación. Mantener una única instancia escritora mientras se use el almacenamiento actual por archivos.
7. **Prueba del entorno final:** no se dispone de una ejecución actual de Docker en este entorno para certificar una imagen nueva. Las pruebas históricas del paquete no certifican la versión presente; habrá que construir y ensayar la versión definitiva en el equipo de preparación o servidor elegido.

La medición local de `var` fue de 4.027 archivos y 341.563.786 bytes, aproximadamente 326 MiB. No incluye el código, otras fuentes privadas, herramientas, copias ni el crecimiento futuro. Sirve como inventario inicial, no como una prueba de capacidad o rendimiento del servidor.

## Qué falta decidir para ejecutar esta estrategia

Sistema y capacidad de la otra computadora; dominio a registrar; cuenta administradora; presupuesto permitido para el dominio y cualquier mejora indispensable; lugar para el equipo y sus respaldos. La elección preliminar es reutilizar esa PC y evitar un servidor alquilado. Con esos datos se puede convertir el plan en una instalación concreta y revisable, y realizar la aceptación antes de reemplazar el enlace temporal.

Durante esta etapa se preparó el plan y se hicieron consultas de diagnóstico. El enlace temporal del personal continúa separado y la publicación general aún no se realizó.

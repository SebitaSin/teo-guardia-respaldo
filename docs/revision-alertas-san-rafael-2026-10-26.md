# Revisión de alertas para San Rafael

26 de octubre de 2026. Pedido: revisar avisos exagerados o que no afectan a San Rafael. Cambios aplicados al servidor y a la interfaz de la instalación actual. Copia previa de fuentes, pantallas, compilado, estado e historial en `_backups/2026-10-26-alertas-san-rafael/`.

## Qué se encontró

| Problema observado | Corrección aplicada |
|---|---|
| El resumen de IA mezclaba una nevada regional a 106 km con recomendaciones de refuerzo para el hospital | Resumen directo de avisos locales y horarios, sin redacción libre ni pedidos de refuerzos añadidos |
| La etiqueta CAP `Immediate` convertía una alerta común de nevadas en supuesto aviso a corto plazo | El tipo ACP se reconoce por su producto o identificación, no sólo por urgencia |
| Un ACP fuera de la ciudad podía elevar el nivel por estar a menos de 25 km | El polígono debe cubrir San Rafael; los avisos fuera se conservan como contexto regional |
| Dos barridos intensos anteriores podían sostener una alerta alta con el barrido actual despejado | La persistencia exige señal en el barrido actual y repetición en los anteriores |
| Una celda lejana con dirección aproximadamente favorable podía pasar lejos de la ciudad | Se comprueba el desvío de la trayectoria estimada; se aclara que el viento no mide el movimiento real de la celda |
| Una celda estacionaria en cualquier dirección podía llamarse riesgo de aluvión y subir a preparación | Queda como eco regional; sin un vínculo hidrológico comprobado no se afirma afectación de San Rafael |
| El radar almacenado conservaba `vigente: true` al fallar la descarga | Su antigüedad se recalcula siempre a partir de la imagen; se separan observaciones vencidas |
| El sistema mantenía artificialmente niveles altos y los bajaba por escalones cada 30 minutos | El nivel sigue los motivos vigentes; el historial conserva lo ocurrido |
| Un aviso vencido podía conservar gravedad durante seis horas por falta de respuesta del SMN | Se señala la falta de actualización y se conserva el dato como antecedente, sin sostener una alerta vencida |
| Una descarga parcial del SMN podía parecer ausencia de avisos locales | Se marca la lectura incompleta y se conserva el último dato válido con su hora |
| Fechas inválidas se interpretaban como si fueran de ahora; horas locales con segundos podían fallar | Se normalizan las horas de Mendoza y las fechas inválidas se indican como datos incompletos |
| En el cálculo de Contingencia, las próximas dos horas se tomaban desde medianoche | Las ventanas se calculan por fecha y hora actual, con zona horaria y sin mover datos de mañana a hoy por huecos de la serie |
| Una cantidad prevista de lluvia podía rotularse como riesgo de aluvión o inundación | Se informa lluvia y acumulado previstos; el modelo solo no confirma esos impactos |
| Un cálculo sísmico aproximado podía declarar catástrofe o daños probables | No declara por sí solo grado 9 ni daños; se presenta como estimación de sacudida local |

Los avisos amarillos, naranjas o rojos del SMN que cubren la ciudad no se ocultan. Se conserva su color oficial y su período. Para el nivel operativo se distinguen avisos vigentes o que comienzan dentro de seis horas de los que son posteriores; los posteriores siguen disponibles como previsión.

Una fuente caída no significa que el tiempo esté despejado. Se conservan los antecedentes y se señala qué información falta, sin convertir esa ausencia en una emergencia confirmada. Una alerta local que todavía tiene vigencia tampoco se borra sólo porque falle una descarga posterior.

## Comprobación con fuentes reales

Se guardaron dos CAP públicos del SMN como casos de regresión:

- **Nevadas de cordillera del 26/10:** el borde del polígono está a unos 106 km del hospital. Es un aviso regional común, aunque tenga urgencia `Immediate`. No eleva por sí solo el nivel de San Rafael ni aparece como nevada en el resumen del hospital.
- **Tormentas del 26/10 que sí cubren San Rafael:** la reproducción conserva el aviso local amarillo y el nivel correspondiente. No se puso todo en verde mediante una reducción general de los umbrales.

En la consulta final a la app del **26/10 a las 18:07 de Buenos Aires**, con política de cálculo versión 3, el SMN respondió y se leyeron **45 de 45 documentos**. No había avisos locales en esa lectura; quedaron nevadas regionales a **106 y 115 km**, correctamente identificadas como avisos comunes. El nivel fue **1, Sin alerta activa**, sin fuentes marcadas incompletas. Es una comprobación de ese momento, no una garantía sobre el tiempo posterior.

La muestra guardada antes de la actualización tenía un aviso local de tormentas y un resumen que agregaba la nevada regional. Los documentos del proveedor también cambiaron durante la revisión: por eso la prueba del CAP local guardado es necesaria para comprobar que una alerta pertinente se conserva.

El servidor se reinició usando su iniciador protegido. Se comprobó la respuesta de la API, el archivo de pantalla nuevo servido por la app y que el formulario público del personal siguiera devolviendo 200. El botón de la barra de alertas ahora lleva directamente a la pantalla de clima. No se enviaron correos o mensajes de alerta.

## Pruebas

- Tipos y compilación de producción aprobados.
- Pruebas completas de servidor aprobadas; 31 pruebas específicas de clima, radar y pertinencia.
- 51 pruebas de Contingencia aprobadas, incluidas cuatro nuevas de ventanas horarias.
- 49 pruebas Python aprobadas.

Se probaron alertas dentro y fuera del polígono, avisos previstos, vencimientos, caída y lectura parcial de fuentes, imágenes viejas o sin fecha, un barrido actual despejado, trayectorias que pasan de costado, eventos de madrugada que ya pasaron y conservación de avisos locales válidos.

## Límites que siguen abiertos

Estos cambios corrigen errores de tiempo, alcance, datos almacenados y presentación. **No certifican la sensibilidad ni la tasa de falsas alarmas meteorológicas del sistema.** Los umbrales de lluvia, radar e intensidad sísmica aproximada siguen pendientes de contraste con eventos reales de San Rafael y revisión por las personas responsables. La dirección estimada por viento no sustituye el seguimiento medido de una celda, y falta desarrollar y validar vínculos hidrológicos específicos para evaluar aluviones.

Se comprobó la aplicación por sus respuestas y archivos servidos; no se hizo una revisión visual completa en un navegador real. Los cambios requieren recargar la pantalla que estuviera abierta.

## Fuentes oficiales consultadas

- [SMN: niveles y alertas](https://ws2.smn.gob.ar/alertas).
- [SMN: diferencias entre alertas y avisos a muy corto plazo](https://www.smn.gob.ar/sites/default/files/PreguntasFrecuentes.pdf).
- [CAP de tormentas utilizado en la regresión](https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20261026121213_Tormenta_Cordillera_alertas_alertas_4.xml).
- [CAP de nevadas utilizado en la regresión](https://ssl.smn.gob.ar/feeds/CAP/xml_generados/CAP_20261026121210_Nevada_Cordillera_alertas_alertas_1.xml).
- [INPRES: escalas de intensidad](https://www.inpres.gob.ar/docs/Escalas%20de%20Intensidad.pdf).
- [DACC Mendoza: información sobre tormentas y granizo](https://www.contingencias.mendoza.gov.ar/lucha.php).

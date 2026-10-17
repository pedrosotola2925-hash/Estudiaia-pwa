# EstudiaIA 2 — diseño del instalador y revisión funcional

Estado: diseño conversacional aprobado; esta especificación escrita requiere revisión del usuario antes de elaborar el plan de implementación.

## 1. Objetivo y acuerdos

Crear un **instalador .exe para Windows** de EstudiaIA 2, conservando el aspecto y las funciones del código enviado, corrigiendo los defectos funcionales y de seguridad encontrados e incorporando **Dalia, español de México (`es-MX-DaliaNeural`), como voz predeterminada**.

Petición expresa del usuario: «un instalador .exe y arregla todo lo malo que encuentres» y «al final antes de terminar, probemosla antes». El trabajo no se dará por terminado solo porque compile o pasen las pruebas unitarias: se probará el ejecutable instalado y habrá una comprobación final con el usuario.

La instalación anterior de `C:/Users/atrap/AppData/Local/EstudiaIA` permanecerá intacta. No se leerán ni extraerán automáticamente sus claves o datos. No se modificará Claude Code ni la configuración o el entorno Python de Hermes.

## 2. Alcance y límites

Incluido:
- Inicio/tutor, selector de curso, Materias, Aprender a estudiar, Prácticas, Vídeos/lecciones y Progreso.
- Voz mexicana por defecto y controles de reproducción; mantener una selección de voz accesible.
- Fotos/PDF de apuntes, planes de estudio, notas de técnicas y temporizador Pomodoro.
- Ajustes locales para configurar las claves de Gemini y YouTube sin recompilar ni pegarlas en el chat.
- Correcciones de errores, validación de respuestas, protección frente a HTML inyectado, almacenamiento robusto, cancelación de solicitudes y pruebas.
- Instalación por usuario de una aplicación nueva y un informe de verificación honesto.

No incluido:
- Modelo de lenguaje local, funcionamiento de la IA sin internet o reemplazo de Gemini por otro proveedor.
- Sustituir la búsqueda real de YouTube por enlaces inventados por una IA.
- Rediseño visual completo, cuentas en la nube, suscripciones, backend externo o publicación pública.
- Migración automática del historial de la aplicación anterior.
- Certificación de alineación con el currículo MINEDUC: las unidades propuestas por IA se identificarán como sugeridas, no como un currículo oficial validado.

## 3. Arquitectura y entrega

Aplicación Electron con el HTML/CSS/JavaScript existente adaptado. El proceso principal gestiona configuración protegida, peticiones a Google y síntesis de voz. La interfaz solo accede a operaciones concretas mediante un puente IPC limitado; no recibe acceso a Node ni al sistema de archivos.

Identidad de la aplicación:
- Nombre mostrado: **EstudiaIA 2**.
- Identificador: `cl.estudiaia.desktop.v2`.
- Versión inicial: `2.0.0`.
- Datos nuevos: `%APPDATA%/EstudiaIA2`, separados de la aplicación anterior.
- Instalador NSIS por usuario, sin requerir una instalación de Node o Python en el equipo de destino.
- Archivo de entrega: `EstudiaIA-2.0.0-Setup.exe`.
- Instalación nueva bajo `%LOCALAPPDATA%/Programs/EstudiaIA 2`; no reutilizar el directorio antiguo.

La alternativa portátil se descartó porque el usuario eligió instalador. El tamaño real se comunicará después de compilarlo. No se prometerá firma digital: si el instalador no está firmado, se indicará sin recomendar desactivar la protección de Windows.

La voz usará un adaptador empaquetado con la aplicación. Para reproducir el servicio ya probado, se priorizará un helper aislado basado en `edge-tts` empaquetado como ejecutable; no dependerá del Python de Hermes ni del Python instalado en destino. La interfaz de voz permitirá cambiar ese adaptador sin alterar el tutor. Las dependencias se fijarán en el plan y sus licencias acompañarán la distribución.

## 4. Voz y lectura

- Predeterminada: **Dalia — Español (México)**, ritmo inicial equivalente al de la muestra aceptada (`-5%`), tono natural (`+0Hz`) y volumen inicial de síntesis `-10%`.
- Catalina — Español (Chile) puede permanecer como alternativa seleccionable, junto con las voces locales disponibles, claramente identificadas por idioma y procedencia.
- Controles: escuchar, pausar/reanudar y detener. Probar voz utiliza una frase breve, no vuelve a generar una explicación.
- Una nueva lectura, el cierre de una respuesta o una cancelación detiene la reproducción anterior. No habrá varias lecturas superpuestas.
- La selección y velocidad se guardan entre sesiones.
- Se lee el contenido educativo, sin marcadores de pregunta, etiquetas HTML ni adornos de Markdown. La mini-pregunta se mantiene visible para responderla.
- Las voces neuronales requieren internet y envían el texto al servicio de voz. Esto se informa en Ajustes; se mantienen el texto visible y los controles utilizables si el servicio falla.
- Nunca sustituir silenciosamente una voz latina por español de España. Si una voz no está disponible se informa y se ofrece elegir otra.
- El adaptador tiene tiempo límite y cancelación. La caché de audio se limita a 50 archivos y 100 MB, eliminando los menos recientes cuando se sobrepase cualquiera de los límites.

## 5. Tutor, cursos y materias

- Conservar los cursos y las seis materias suministradas. Inicializar el estado compartido antes de cargar módulos y hacer que las materias estén disponibles sin depender de una propiedad global inexistente.
- Implementar la vista Materias que no tiene renderizador en los fragmentos enviados: tarjetas de materia, unidades sugeridas y entrada al tutor/práctica correspondiente.
- Cada petición educativa incluye el curso seleccionado. No fijar todas las explicaciones a una estudiante de 14 años de 7.º básico cuando se ha elegido otro curso.
- Mantener la estructura pedagógica original: definición, analogía, pasos, ejemplos cotidianos, errores típicos, dato curioso, resumen y mini-pregunta. Mantener la indicación de 350 a 550 palabras para explicaciones desarrolladas y las pistas antes de entregar la solución de un ejercicio.
- Mostrar mensajes claros ante ausencia de clave, rechazo del modelo, respuesta bloqueada, datos inválidos, red interrumpida o cuota agotada. No presentar contenido de demostración como respuesta real de la IA.
- El tutor acepta una consulta activa a la vez; ofrece cancelar y evita que una respuesta antigua sobrescriba una nueva o reaparezca tras cerrarla.
- «Hacer otra pregunta» vuelve a Inicio y enfoca el campo visible. «Explícamelo de nuevo» utiliza el tema real de la respuesta, también cuando proviene de apuntes.
- Las cachés incluyen curso, modelo, versión del formato y texto exacto normalizado solo de forma no destructiva. Deben distinguir `2+3` de `2-3`, cursos distintos y planes correspondientes a días distintos.
- Las unidades recibidas se validan como una lista de nombres no vacíos. Si no pueden obtenerse, se informa; no se hacen pasar «Unidad 1…» por contenido curricular real.

## 6. Apuntes y privacidad

- Aceptar JPEG, PNG, WebP y PDF, hasta **4 MiB por archivo**. Rechazar archivos vacíos, formatos no admitidos y discrepancias evidentes entre extensión, MIME y cabecera.
- Errores de lectura y envío quedan dentro del manejo de errores. Cancelar una selección no inicia ninguna solicitud.
- Antes del envío, indicar que el archivo se analizará mediante Gemini y permitir confirmar el análisis. No almacenar el archivo original ni enviarlo a otro proveedor sin una acción explícita.
- Aplicar las instrucciones educativas y la validación de la mini-pregunta también al resumen de apuntes.
- No incluir claves, archivos en base64 ni el texto privado de apuntes en logs de diagnóstico.

## 7. Prácticas y progreso

- Prácticas de exactamente cinco preguntas, con cuatro opciones no vacías por pregunta, índice correcto entero entre 0 y 3 y explicación textual validada.
- Aceptar solo estructuras válidas antes de mostrar preguntas; un JSON malformado o incompleto produce un error recuperable.
- Responder una pregunta de práctica solo cuenta una vez. Los botones quedan bloqueados después de contestar y se muestra la explicación de forma segura.
- Las mini-preguntas y las preguntas finales de lección suman como máximo un acierto por pregunta, aunque se pulse varias veces.
- Guardar cada intento de práctica una sola vez. Reintentar es un intento nuevo, no una duplicación accidental del resultado anterior.
- Separar progreso por curso y materia. Mantener el contador total de prácticas independiente del historial visible limitado a las últimas 20.
- Tratar datos guardados corruptos como recuperables: no romper la vista ni guardar solo una parte del resultado. Conservar datos recuperables y avisar cuando se descarte un registro inválido.
- El refuerzo de la materia más débil selecciona la materia y espera sus unidades sin depender de un `setTimeout` arbitrario.

## 8. Vídeos y lecciones

- Buscar vídeos reales mediante YouTube Data API, con búsqueda segura estricta y preferencia por vídeos insertables.
- Validar IDs, títulos y URLs de miniaturas; no interpolar texto de terceros directamente en HTML.
- Distinguir lista vacía, falta de clave, cuota agotada y fallo de conexión. Evitar búsquedas duplicadas mientras se carga.
- Volver desde un vídeo conserva la lista ya obtenida; no repetir una búsqueda para un simple regreso.
- Probar la reproducción dentro de la aplicación. Si YouTube impide insertar un vídeo, mostrar el motivo disponible y un botón explícito para abrir ese vídeo en YouTube en el navegador. No afirmar que la reproducción incrustada funciona basándose solo en que aparezca un iframe.
- Las lecciones tienen de cuatro a seis tarjetas válidas y una pregunta final A/B validada. La caché incluye curso, materia y unidad.
- El cambio de curso o materia cancela/descarta resultados anteriores y no mezcla unidades de selecciones distintas.

## 9. Técnicas, notas y plan de estudio

- Conservar las seis técnicas proporcionadas.
- Pomodoro con 25 minutos de estudio, 5 de descanso corto y 15 de descanso largo después de cuatro bloques de estudio. Al terminar una fase suena una señal una sola vez, se anuncia la siguiente y se espera a que el usuario la inicie.
- Pausa/reanudación y reinicio consistentes. Calcular el tiempo por instantes de reloj, no suponiendo que cada intervalo se ejecuta exactamente cada segundo.
- Navegar fuera y volver no crea temporizadores duplicados ni pierde el estado de la sesión. Al cerrar la aplicación se detiene el temporizador; no se añade un servicio de fondo.
- Las notas guardadas pueden consultarse desde la misma sección y sobreviven al reinicio de la aplicación. No mostrar «Guardado» si la escritura falla.
- El plan de estudio exige una materia y una fecha válida no anterior a hoy. Usa fechas locales no ambiguas y el curso actual; no conserva un plan obsoleto únicamente porque coincidan materia y fecha de prueba.

## 10. Ajustes, seguridad y recuperación

- Gemini y YouTube seguirán siendo servicios online. Modelo inicial del código: `gemini-3.5-flash-lite`, configurable y comprobable con la clave del usuario; no prometer cuotas gratuitas concretas.
- Pantalla de ajustes para guardar claves y probar las conexiones. Claves ocultas en pantalla, no empaquetadas, no en `localStorage` y no devueltas al renderer después de guardarlas.
- Cifrar las claves localmente mediante almacenamiento protegido de Windows desde el proceso principal. Si el cifrado no está disponible, no guardarlas en texto plano. Esto protege frente a otros usuarios del equipo, no pretende proteger frente a cualquier proceso del mismo usuario.
- `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, política CSP restrictiva, navegación/ventanas limitadas y permisos denegados salvo necesidad documentada.
- Validar remitente y argumentos en cada operación IPC. Permitir solo destinos de proveedores conocidos y apertura externa de URLs YouTube construidas desde un ID validado.
- Renderizar respuestas, opciones, lecciones, nombres, errores e historial como texto o Markdown saneado. Ninguna respuesta del modelo puede ejecutar código o solicitar acceso al sistema.
- Tiempo límite y cancelación en llamadas externas; reintentos de cuota acotados, visibles y cancelables. No sustituir claves ni intentar eludir límites del proveedor.
- Los cambios de configuración/datos se escriben de forma atómica. Una escritura fallida no destruye la última configuración válida.
- Mantener el diseño reconocible, añadir etiquetas accesibles a los controles y corregir desbordamientos y contraste ilegible sin rediseñar toda la aplicación.

## 11. Pruebas y criterio de finalización

### Pruebas automatizadas

1. Arranque con todas las vistas y materias disponibles; ausencia de errores de inicialización.
2. Aislamiento por curso, validación de JSON y archivos, caché que distingue operadores y respuestas concurrentes/canceladas.
3. Prevención de HTML ejecutable, argumentos IPC rechazados, claves no filtradas y navegación externa restringida.
4. Una contabilización por respuesta/intento; historial y totales consistentes; recuperación frente a almacenamiento corrupto o fallido.
5. Temporizador con reloj controlado, pausa/reanudación, navegación, descansos y señal única.
6. Cambios de voz, cancelación y fallo del servicio sin bloquear el texto.
7. Flujos de interfaz con respuestas de prueba identificadas como fixtures. Los fixtures no se distribuyen como contenido real ni cuentan como pruebas de los proveedores.

### Prueba del instalador y la aplicación real

- Generar el instalador, calcular su SHA-256 y comprobar sus archivos/resultados de compilación.
- Ejecutar el instalador por usuario en el directorio nuevo y comprobar por la ruta del proceso que se abre EstudiaIA 2, no la versión anterior.
- Probar navegación, cambio de curso, notas, Pomodoro, persistencia tras cerrar/abrir, configuración y reproducción real de Dalia desde la aplicación instalada.
- Con credenciales válidas configuradas por el usuario en la propia aplicación: pregunta al tutor, mini-pregunta, apunte de prueba no privado, práctica completa, progreso, plan, lección y búsqueda/reproducción de vídeo.
- Si faltan credenciales, una API está bloqueada o se agota la cuota, marcar esas pruebas como **pendientes/bloqueadas**. No declarar «todo funciona» ni completar la aceptación como si se hubieran ejecutado.
- Realizar la prueba final con el usuario: que abra la aplicación, escuche la voz mexicana y pruebe una consulta y una práctica. Registrar su resultado y corregir los fallos que aparezcan antes del cierre.

**Finalizado** significa: instalador disponible, pruebas automatizadas y del ejecutable realizadas con evidencia, fallos importantes corregidos y prueba final del usuario atendida. Cualquier bloqueo o limitación restante se comunica explícitamente; una compilación correcta por sí sola no cumple el encargo.

## 12. Evidencia de partida y referencias

- Auditoría inicial ejecutada con los archivos enviados: errores por `window.hooks` sin inicializar; seis materias declaradas pero ninguna devuelta; índices de respuesta inválidos aceptados; colisión de caché de operadores; doble conteo; HTML sin escapar; selección de voz de España aunque existe una candidata mexicana; error de historial corrupto con escritura parcial.
- Muestras Dalia/Catalina generadas con una copia aislada de `edge-tts 7.3.1` y comprobadas con ffprobe/ffmpeg. La instalación existente de `edge-tts 7.2.7` devolvió HTTP 403 al sintetizar; no fue actualizada ni modificada. Las muestras demuestran síntesis, no integración en la futura aplicación.
- El `config.js` enviado contiene marcadores, no claves utilizables. Las pruebas reales de Gemini/YouTube dependen de la configuración local del usuario.
- Fuente: HTML, CSS, configuración, currículo y navegación pegados en la conversación; adjuntos `pasted_content_2026-10-17_07-12-27-801_28c790.txt` (tutor), `pasted_content_2026-10-17_07-15-57-883_428287.txt` (prácticas/progreso), `pasted_content_2026-10-17_07-16-07-403_9459eb.txt` (vídeos/lecciones) y `pasted_content_2026-10-17_07-16-17-918_5cbd05.txt` (técnicas).
- Referencias primarias de diseño: documentación de seguridad y `safeStorage` de Electron, destinos NSIS de electron-builder, modelos de Gemini en Google AI y distribución oficial `edge-tts` de PyPI. Se verificará la compatibilidad de las versiones elegidas durante la implementación.

## Revisión de la especificación

Revisión propia: el alcance corresponde al instalador y mejoras solicitados; no promete IA offline, claves disponibles ni tamaño ficticio. Todas las pantallas y los defectos reproducidos tienen requisitos y pruebas. Los valores añadidos para cerrar ambigüedades son el descanso largo de 15 minutos, límites de caché, identidad separada y configuración explícita de credenciales; están visibles en este documento para revisión del usuario.

/**
 * Guía del sistema: el mismo contenido se muestra en Configuración → Guía del sistema
 * y se exporta como PDF. Para agregar un módulo, sumá una entrada a GUIA.
 */

export type SeccionGuia = {
  id: string;
  titulo: string;
  icono: string; // nombre del ícono de lucide (ver GuiaSistema.tsx)
  resumen: string;
  pasos?: { titulo: string; detalle: string }[];
  consejos?: string[];
};

export const GUIA: SeccionGuia[] = [
  {
    id: "inicio",
    titulo: "Primeros pasos",
    icono: "Rocket",
    resumen:
      "El sistema reúne en un solo lugar el trabajo del área: tickets, equipos, tóners, guardias, instructivos, oficina y credenciales. Cada persona entra con su usuario y ve solo los módulos que su rol permite.",
    pasos: [
      { titulo: "Ingresar", detalle: "Entrá con tu usuario o correo y tu contraseña. El ojito del campo muestra lo que escribiste. Al entrar aparece una bienvenida con tu nombre." },
      { titulo: "Moverse por el sistema", detalle: "El menú de la izquierda lleva a cada módulo. Con Ctrl + K se abre el buscador: escribí el nombre de un módulo o una acción y presioná Enter." },
      { titulo: "Escanear un equipo", detalle: "El ícono de escaneo de la barra superior abre la cámara para leer la etiqueta QR de un equipo." },
      { titulo: "Notificaciones", detalle: "La campana muestra avisos: tickets asignados, fallas reportadas por QR, stock crítico y vencimientos." },
      { titulo: "Mi perfil", detalle: "Tocá tu nombre o tu foto al pie del menú. Ahí subís tu foto (la podés encuadrar y hacer zoom), cargás tu puesto, teléfono e interno, cambiás tu contraseña y elegís el tema." },
      { titulo: "Modo claro u oscuro", detalle: "Con el botón de sol o luna al pie del menú cambiás el tema. Se recuerda en cada computadora." },
    ],
    consejos: ["Si el menú ocupa mucho lugar, contraelo con el botón de panel al pie: quedan solo los íconos.", "Cerrá sesión al usar una computadora compartida."],
  },
  {
    id: "dashboard",
    titulo: "Dashboard",
    icono: "LayoutDashboard",
    resumen: "Es la pantalla de inicio: resume lo más importante del día en un vistazo.",
    pasos: [
      { titulo: "Leer los indicadores", detalle: "Arriba ves los tickets abiertos, los tóners en stock crítico, la guardia de hoy y otras alertas del área." },
      { titulo: "Ir al detalle", detalle: "Cada tarjeta lleva al módulo correspondiente para actuar." },
    ],
  },
  {
    id: "tickets",
    titulo: "Tickets (mesa de ayuda)",
    icono: "Ticket",
    resumen:
      "Registra cada pedido o problema y lo acompaña hasta que se termina. Todo queda en la actividad del ticket: quién lo tomó, qué se hizo y cuándo se cerró.",
    pasos: [
      { titulo: "Ver mis tickets", detalle: "Arriba de la lista elegí Todos, Mis tickets (asignados o creados por vos), Asignados a mí o Creados por mí. También podés tocar las tarjetas de arriba. El sistema recuerda tu elección." },
      { titulo: "Colores de cada estado", detalle: "Pendiente rojo, Asignado violeta, Trabajando celeste, En espera ámbar, Resuelto verde y Terminado gris. Se usan igual en la barra de arriba, en la franja de cada fila y en la barra de evolución del ticket." },
      { titulo: "Crear un ticket", detalle: "Botón 'Nuevo ticket'. Completá título, descripción, prioridad, sector y, si corresponde, el equipo afectado (podés buscarlo o escanear su QR)." },
      { titulo: "Filtrar la bandeja", detalle: "Los cuadros de arriba (Sin asignar, Asignados y trabajando, En espera, Resueltos) filtran la lista. La búsqueda encuentra por número, título o sector." },
      { titulo: "Abrir un ticket", detalle: "Hacé clic en el título: se abre la ficha completa con la barra de progreso del ticket." },
      { titulo: "Avanzar el ticket", detalle: "El botón grande muestra siempre el siguiente paso: Pendiente → 'Tomar ticket' → Asignado → 'Empezar a trabajar' → Trabajando → 'Marcar resuelto' → Resuelto → 'Terminar ticket' → Terminado." },
      { titulo: "Poner en espera", detalle: "Si dependés de otra persona o de un repuesto, usá 'Poner en espera' y después 'Retomar'." },
      { titulo: "Resolver", detalle: "Al marcarlo resuelto se pide qué se hizo. Esa nota queda visible para todos." },
      { titulo: "Pasos, comentarios y adjuntos", detalle: "Dentro del ticket podés agregar una lista de pasos, comentar, adjuntar archivos y vincular instructivos o el equipo." },
      { titulo: "Historial", detalle: "La pestaña Historial muestra los tickets terminados mes a mes, con tiempos y rankings. Desde ahí se puede reabrir un ticket." },
    ],
    consejos: ["Cada cambio de estado queda registrado automáticamente en la actividad.", "Las fallas reportadas escaneando un QR llegan como tickets con la etiqueta 'Reportado por QR'."],
  },
  {
    id: "activos",
    titulo: "Activos IT (inventario)",
    icono: "Boxes",
    resumen:
      "La planilla técnica de cada equipo: PCs, notebooks, impresoras, monitores, switches, teléfonos, tablets y celulares. Incluye ubicación, asignación, reparaciones, controles, adjuntos y su etiqueta QR.",
    pasos: [
      { titulo: "Dar de alta un equipo", detalle: "'Nuevo activo': elegí la categoría y completá los datos. Los campos técnicos cambian según la categoría (por ejemplo IP y MAC para equipos de red)." },
      { titulo: "Ubicación física", detalle: "Además de planta y sector, cargá el puesto, escritorio o rack. Se ve en la planilla, la tabla y la etiqueta." },
      { titulo: "Buscar y filtrar", detalle: "Buscá por código, descripción, IP, serie o ubicación. Usá los filtros por estado, sector y 'Filtros' para planta, modelo o controles vencidos. Con 'Columnas' elegís qué columnas ver." },
      { titulo: "Planilla técnica", detalle: "Clic en un equipo: pestañas de Resumen, Historial, Tickets, Reparaciones, Asignaciones y Archivos." },
      { titulo: "Registrar control, reparación o asignación", detalle: "Desde la planilla o desde los botones de cada fila." },
      { titulo: "Importar y exportar", detalle: "'Importar' acepta Excel o CSV con las columnas del módulo. 'Más' exporta a Excel, CSV o JSON." },
    ],
  },
  {
    id: "qr",
    titulo: "Etiquetas y escaneo QR",
    icono: "QrCode",
    resumen:
      "Cada equipo lleva una etiqueta con un QR. Quien la escanea con el celular abre la ficha del equipo: el personal de Sistemas ve acciones rápidas y cualquier otra persona puede reportar una falla sin tener cuenta.",
    pasos: [
      { titulo: "Imprimir etiquetas", detalle: "Activos IT → 'Etiquetas'. Elegí qué imprimir (sin etiqueta, para reimprimir, seleccionados o filtrados) y el formato: rollo estándar, rollo mini o A4. Revisá la vista previa e imprimí." },
      { titulo: "Confirmar las impresas", detalle: "Después de imprimir, el sistema pregunta si salieron bien: así dejan de figurar como pendientes." },
      { titulo: "Impresora térmica de 57 mm", detalle: "En la configuración de la impresora: papel de 57 mm de ancho, márgenes en 0 y escala 100 %." },
      { titulo: "Escanear con sesión", detalle: "Aparecen botones grandes: planilla técnica, abrir ticket, registrar control, cambiar ubicación, asignar, reparación y reimprimir etiqueta." },
      { titulo: "Clave o PIN", detalle: "Según la configuración, al escanear se pide la contraseña o un PIN de 4 a 6 números (se crea la primera vez). Por defecto, una vez cada 8 horas por dispositivo." },
      { titulo: "Reporte de fallas sin cuenta", detalle: "Quien no tiene usuario ve el equipo y un formulario: '¿Qué le pasa?', nombre e interno. Se crea un ticket vinculado y se avisa a Sistemas." },
      { titulo: "Etiquetas en blanco", detalle: "En 'Etiquetas' → 'Etiquetas en blanco' se reservan códigos nuevos. Pegás la etiqueta en el equipo, la escaneás y se abre el alta con ese código." },
    ],
    consejos: [
      "La cámara del celular necesita HTTPS (ver Configuración → General → Dirección impresa en el QR).",
      "Con un lector de códigos USB también se puede: el buscador y la auditoría aceptan el código leído.",
    ],
  },
  {
    id: "auditoria-fisica",
    titulo: "Auditoría física de activos",
    icono: "ClipboardList",
    resumen: "Sirve para controlar que los equipos estén donde figura en el sistema. Se recorre un sector escaneando las etiquetas.",
    pasos: [
      { titulo: "Crear la auditoría", detalle: "Activos IT → 'Auditoría' → 'Nueva auditoría'. Elegí planta y sector: el sistema calcula cuántos equipos se esperan." },
      { titulo: "Escanear", detalle: "Activá la cámara (lee una etiqueta tras otra) o usá un lector USB. Opcional: escribí la 'Ubicación actual' (por ejemplo Box 3) y se guarda en cada equipo escaneado." },
      { titulo: "Leer el resultado", detalle: "Cada lectura se clasifica: Encontrado, Figura en otro lugar (con botón 'Mover acá'), Código sin equipo (con 'Dar de alta') o Ya escaneado." },
      { titulo: "Cerrar e informar", detalle: "'Cerrar auditoría' genera el informe PDF con faltantes, encontrados en otro lugar, códigos sin registrar y firmas." },
    ],
    consejos: ["Los equipos encontrados cuentan como control realizado (se puede desactivar)."],
  },
  {
    id: "toners",
    titulo: "Tóners",
    icono: "Printer",
    resumen: "Stock del depósito, códigos correlativos, movimientos de ingreso y uso, y pedidos al proveedor.",
    pasos: [
      { titulo: "Ingreso", detalle: "Registrá lo que llega al depósito: modelo, cantidad y remito." },
      { titulo: "Uso o reposición", detalle: "Al cambiar un tóner registrá el sector y, si tiene, el código. El stock se descuenta solo." },
      { titulo: "Códigos", detalle: "Generá códigos correlativos para etiquetar cada unidad." },
      { titulo: "Pedidos", detalle: "Armá el pedido al proveedor (sugiere los modelos en stock crítico), imprimí el PDF y al recibirlo confirmá las cantidades." },
      { titulo: "Movimientos", detalle: "Filtrá por tipo, modelo y período; exportá a Excel." },
    ],
  },
  {
    id: "guardias",
    titulo: "Guardias",
    icono: "CalendarClock",
    resumen: "Calendario de guardias del área (lunes a viernes de 20 a 8 h y fines de semana completos) y la liquidación del período.",
    pasos: [
      { titulo: "Cargar guardias", detalle: "Elegí el operario y los días en el calendario." },
      { titulo: "Vacaciones", detalle: "Se registran por operario y se ven en el resumen del período." },
      { titulo: "Liquidación", detalle: "Calcula días normales y feriados por operario. 'Exportar PDF' genera el documento para el área correspondiente." },
    ],
    consejos: ["Los feriados se administran en Configuración → Feriados y la liquidación los toma automáticamente."],
  },
  {
    id: "instructivos",
    titulo: "Instructivos",
    icono: "BookOpen",
    resumen: "La wiki del área: procedimientos organizados en carpetas, con texto y PDFs adjuntos.",
    pasos: [
      { titulo: "Carpetas", detalle: "Creá carpetas por tema (Redes, Impresoras, Altas de usuarios…)." },
      { titulo: "Documentos", detalle: "Dentro de una carpeta creá un instructivo, escribí el contenido y adjuntá el PDF si lo tenés. Arrastrar archivos también funciona." },
      { titulo: "Buscar", detalle: "El buscador encuentra por título, contenido y etiquetas." },
      { titulo: "Vincular a tickets", detalle: "Desde un ticket podés vincular el instructivo que usaste para resolverlo." },
    ],
  },
  {
    id: "oficina",
    titulo: "Oficina",
    icono: "BriefcaseBusiness",
    resumen: "Teléfonos internos, pedidos de compra con seguimiento por ítem y la agenda de proveedores y correos de la empresa.",
    pasos: [
      { titulo: "Teléfonos internos", detalle: "Buscá por nombre, sector o número. Clic en el interno lo copia. Se exporta a Excel." },
      { titulo: "Los 3 pasos", detalle: "Arriba se ve el camino: 1 · Armar la lista, 2 · Pedidos enviados, 3 · Lo que falta. Cada paso muestra cuántas cosas tiene pendientes." },
      { titulo: "Armar la lista", detalle: "Completá qué hace falta, la cantidad (con + y −), el sector y el precio estimado; «Marcar urgente» lo destaca. Destildá los ítems que querés dejar para un pedido posterior y tocá «Generar pedido»: se numera y se abre el PDF." },
      { titulo: "Pedidos", detalle: "Cada pedido muestra una barra con cuántos ítems están pendientes, comprados en parte, comprados o recibidos. 'Seguimiento' abre el detalle: aprobar o rechazar, marcar cada ítem comprado o recibido (también cantidades parciales, como 3 de 5), cargar proveedor y precio real y dejar notas. El estado del pedido avanza solo: Enviado → Aprobado → Compra parcial → Comprado → Recibido, y todo queda en el historial." },
      { titulo: "Pendientes de compra", detalle: "Junta lo que falta comprar o recibir de todos los pedidos, con los urgentes primero. Un clic lo marca como comprado o recibido." },
      { titulo: "Agenda · Proveedores", detalle: "Rubro, persona de contacto, email, teléfono, WhatsApp, web, dirección y CUIT. Tocá un email o teléfono para escribir o llamar, o copialo. Los favoritos quedan arriba y los proveedores aparecen al registrar una compra." },
      { titulo: "Agenda · Emails de la empresa", detalle: "La casilla de cada área con su usuario y clave. La clave se guarda cifrada: para verla o copiarla se toca el ojito y se pide la clave de visualización; se ve 1 minuto y se oculta sola." },
    ],
  },
  {
    id: "credenciales",
    titulo: "Credenciales",
    icono: "KeyRound",
    resumen: "Bóveda cifrada de accesos a servidores, equipos y servicios. Cada vez que alguien ve o copia una clave queda registrado.",
    pasos: [
      { titulo: "Guardar una credencial", detalle: "'Nueva credencial': servicio, categoría, usuario, secreto, IP o URL y notas. El secreto se guarda cifrado." },
      { titulo: "Ver o copiar", detalle: "El ojito y el botón de copiar piden la clave de visualización (Configuración → Seguridad). El secreto se ve 1 minuto con cuenta regresiva y se oculta solo; en ese minuto no se vuelve a pedir la clave. Todo queda en Auditoría." },
      { titulo: "Filtrar", detalle: "Por categoría o con el buscador; las columnas se ordenan con un clic en el título." },
    ],
    consejos: ["La clave de cifrado del servidor (.env) es imprescindible: guardá una copia en un lugar seguro."],
  },
  {
    id: "auditoria",
    titulo: "Auditoría (registro de cambios)",
    icono: "History",
    resumen: "Registro de quién hizo qué y cuándo en todo el sistema.",
    pasos: [
      { titulo: "Filtrar", detalle: "Por usuario, módulo, acción y rango de fechas." },
      { titulo: "Exportar", detalle: "Descargá el resultado en Excel para un control externo." },
    ],
  },
  {
    id: "configuracion",
    titulo: "Configuración",
    icono: "Settings2",
    resumen: "Administración del sistema (solo administradores).",
    pasos: [
      { titulo: "General", detalle: "Versión instalada, cantidad de usuarios por rol y ajustes del QR." },
      { titulo: "Usuarios", detalle: "Alta, edición y baja de usuarios; asignación de rol." },
      { titulo: "Roles y permisos", detalle: "Creá roles propios (por ejemplo 'Soporte N1') y marcá qué pueden ver, crear, editar o eliminar en cada módulo. El servidor aplica estos permisos." },
      { titulo: "Seguridad", detalle: "Clave de visualización: la que se pide para ver o copiar claves guardadas (Credenciales y emails de la Agenda). La define o cambia un administrador confirmando con su propia contraseña. 5 intentos fallidos bloquean 5 minutos." },
      { titulo: "Feriados", detalle: "Feriados nacionales y propios que usa la liquidación de guardias." },
      { titulo: "Reportes", detalle: "Reporte mensual del área en PDF." },
      { titulo: "Datos", detalle: "Tamaño de la base y depuración de información vieja (auditoría antigua, notificaciones leídas, versiones viejas, sesiones vencidas)." },
    ],
  },
  {
    id: "servidor",
    titulo: "Instalación y actualización",
    icono: "Server",
    resumen: "Cómo mantener el sistema al día en el servidor.",
    pasos: [
      { titulo: "Actualizar", detalle: "En el servidor: sudo bash /opt/nodara/scripts/actualizar.sh. Hace backup de la base, descarga la versión nueva, compila, aplica migraciones y reinicia." },
      { titulo: "HTTPS", detalle: "sudo bash /opt/nodara/deploy/https.sh activa HTTPS en el puerto 3443 (necesario para la cámara del celular)." },
      { titulo: "Backups", detalle: "actualizar.sh guarda los últimos 14 backups en /var/backups/nodara. Con Proxmox, además, programá vzdump del contenedor." },
    ],
  },
];

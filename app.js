import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore, collection, addDoc, onSnapshot,
    doc, updateDoc, getDoc, getDocs, query, orderBy, deleteDoc, where, setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// CONFIGURACION DE FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBK1zWJmOsjwgIOeyvVYKuIrTCO03qS-es",
  authDomain: "jugueteria-27534.firebaseapp.com",
  projectId: "jugueteria-27534",
  storageBucket: "jugueteria-27534.firebasestorage.app",
  messagingSenderId: "382726136955",
  appId: "1:382726136955:web:cf107efd0ae179bc492ede",
  measurementId: "G-TFNHLMQK0R"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Cambia este email por el usuario Firebase del dueno.
const DUENO_EMAIL = "hosteriamicati@gmail.com";

// Elementos DOM
const loginDiv = document.getElementById("loginDiv");
const appDiv = document.getElementById("appDiv");
const carritoDiv = document.getElementById("carritoLista");
const ventasDiv = document.getElementById("ventasLista");
const estadisticasDiv = document.getElementById("estadisticasLista");
const periodoEstadisticasSelect = document.getElementById("periodoEstadisticas");
const rangoEstadisticasCampos = document.getElementById("rangoEstadisticasCampos");
const fechaEstadisticasDesdeInput = document.getElementById("fechaEstadisticasDesde");
const fechaEstadisticasHastaInput = document.getElementById("fechaEstadisticasHasta");
const solicitudesDiv = document.getElementById("solicitudesLista");
const solicitudesBtn = document.getElementById("solicitudesBtn");
const cajaBtn = document.getElementById("cajaBtn");
const cajaDiv = document.getElementById("cajaResumen");
const fechaVentasInput = document.getElementById("fechaVentas");
const buscarVentaInput = document.getElementById("buscarVenta");
const totalSpan = document.getElementById("total");
const totalContainer = document.getElementById("totalContainer");

let carrito = {};
let total = 0;
let ventasCache = [];
let estadisticasCache = [];
let ultimoTicket = null;
let ventasUnsubscribe, estadisticasUnsubscribe, solicitudesUnsubscribe;
let cantidadVentasVisibles = 10;
let rolUsuarioActual = "empleado";
const CANTIDAD_VENTAS_POR_PAGINA = 10;

function normalizarImporte(valor) {
    return Math.round((Number(valor) || 0) * 100) / 100;
}

function importeACentavos(valor) {
    return Math.round((Number(valor) || 0) * 100);
}

function centavosAImporte(centavos) {
    return centavos / 100;
}

function fechaLocalISO(fecha = new Date()) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, "0");
    const day = String(fecha.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function rangoDelDia(fechaISO) {
    const inicio = new Date(`${fechaISO}T00:00:00`);
    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 1);
    return { inicio, fin };
}

function rangoSemanaActual() {
    const hoy = new Date();
    const inicio = new Date(hoy);
    const dia = inicio.getDay() || 7;
    inicio.setDate(inicio.getDate() - dia + 1);
    inicio.setHours(0, 0, 0, 0);

    const fin = new Date(inicio);
    fin.setDate(fin.getDate() + 7);
    return { inicio, fin };
}

function rangoMesActual() {
    const hoy = new Date();
    const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const fin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
    return { inicio, fin };
}

function rangoEstadisticas() {
    const periodo = periodoEstadisticasSelect ? periodoEstadisticasSelect.value : "dia";

    if (periodo === "semana") return rangoSemanaActual();
    if (periodo === "mes") return rangoMesActual();
    if (periodo === "rango") {
        const desde = fechaEstadisticasDesdeInput && fechaEstadisticasDesdeInput.value ?
            fechaEstadisticasDesdeInput.value :
            (fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO());
        const hasta = fechaEstadisticasHastaInput && fechaEstadisticasHastaInput.value ?
            fechaEstadisticasHastaInput.value :
            desde;

        const inicio = new Date(`${desde}T00:00:00`);
        const fin = new Date(`${hasta}T00:00:00`);
        fin.setDate(fin.getDate() + 1);

        if (fin <= inicio) {
            return { invalido: true };
        }

        return { inicio, fin };
    }
    if (periodo === "todo") return null;

    const fechaSeleccionada = fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO();
    return rangoDelDia(fechaSeleccionada);
}

// AUTENTICACION AUTOMATICA
onAuthStateChanged(auth, async (user) => {
    if (user) {
        rolUsuarioActual = await obtenerRolUsuario(user.email);
        loginDiv.classList.remove("active");
        appDiv.style.display = "block";
        if (fechaVentasInput && !fechaVentasInput.value) {
            fechaVentasInput.value = fechaLocalISO();
        }
        actualizarVistaPorUsuario();
        mostrarSeccion("productos");
        cargarVentas();
        cargarEstadisticas();
        cargarSolicitudes();
    } else {
        loginDiv.classList.add("active");
        appDiv.style.display = "none";
        rolUsuarioActual = "empleado";
        if (ventasUnsubscribe) ventasUnsubscribe();
        if (estadisticasUnsubscribe) estadisticasUnsubscribe();
        if (solicitudesUnsubscribe) solicitudesUnsubscribe();
    }
});

// LOGIN
window.login = async function () {
    try {
        const email = document.getElementById("email").value.trim();
        const password = document.getElementById("password").value;

        if (!email || !password) {
            alert("Completa email y contrasena");
            return;
        }

        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        alert("Error de login: " + error.message);
    }
};

// LOGOUT
window.logout = async function () {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error logout:", error);
    }
};

// NAVEGACION
window.mostrarSeccion = function (seccion) {
    document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

    document.getElementById(seccion).classList.add("active");
    const boton = document.querySelector(`.nav-btn[data-section="${seccion}"]`);
    if (boton) boton.classList.add("active");
};

async function obtenerRolUsuario(email) {
    if (!email) return "empleado";

    try {
        const usuarioSnap = await getDoc(doc(db, "usuarios", email.toLowerCase()));
        if (usuarioSnap.exists() && usuarioSnap.data().rol) {
            return usuarioSnap.data().rol;
        }
    } catch (error) {
        console.warn("No se pudo leer el rol del usuario:", error);
    }

    return email.toLowerCase() === DUENO_EMAIL.toLowerCase() ? "dueno" : "empleado";
}

function usuarioActualEsDueno() {
    const usuarioActual = auth.currentUser;
    return usuarioActual && usuarioActual.email.toLowerCase() === DUENO_EMAIL.toLowerCase();
}

function actualizarVistaPorUsuario() {
    const mostrarDueno = usuarioActualEsDueno() ? "block" : "none";
    if (solicitudesBtn) solicitudesBtn.style.display = mostrarDueno;
    if (cajaBtn) cajaBtn.style.display = "block";
}

// AGREGAR PRODUCTO MANUAL AL CARRITO
window.agregarVentaManual = function () {
    const nombre = document.getElementById("nombreProducto").value.trim();
    const precio = normalizarImporte(document.getElementById("precioProducto").value);
    const cantidad = parseInt(document.getElementById("cantidadProducto").value);

    if (!nombre || isNaN(precio) || isNaN(cantidad) || precio <= 0 || cantidad <= 0) {
        alert("Completa nombre, precio y cantidad correctamente.");
        return;
    }

    const id = `manual-${Date.now()}`;
    carrito[id] = { nombre, precio, cantidad };

    document.getElementById("nombreProducto").value = "";
    document.getElementById("precioProducto").value = "";
    document.getElementById("cantidadProducto").value = "1";

    calcularTotal();
    renderCarrito();
    mostrarSeccion("carrito");
};

window.agregarCarrito = function (id, nombre, precio) {
    if (!carrito[id]) {
        carrito[id] = { nombre, precio: normalizarImporte(precio), cantidad: 0 };
    }
    carrito[id].cantidad++;
    calcularTotal();
    renderCarrito();
    alert(`${nombre} agregado al carrito`);
};

// CALCULAR TOTAL
function calcularTotal() {
    let totalCentavos = 0;
    for (let id in carrito) {
        totalCentavos += importeACentavos(carrito[id].precio) * carrito[id].cantidad;
    }
    total = centavosAImporte(totalCentavos);
    totalSpan.textContent = total.toFixed(2);
    totalContainer.style.display = total > 0 ? "block" : "none";
}

// RENDERIZAR CARRITO
function renderCarrito() {
    carritoDiv.innerHTML = "";

    if (Object.keys(carrito).length === 0) {
        carritoDiv.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em;">El carrito esta vacio</p>';
        return;
    }

    for (let id in carrito) {
        const producto = carrito[id];
        const subtotal = centavosAImporte(importeACentavos(producto.precio) * producto.cantidad).toFixed(2);

        carritoDiv.innerHTML += `
            <div class="item">
                <div>
                    <strong>${producto.nombre}</strong><br>
                    <small>$${producto.precio.toFixed(2)} x ${producto.cantidad} = $${subtotal}</small>
                </div>
                <button class="btn btn-danger" onclick="eliminarItem('${id}')">
                    Quitar
                </button>
            </div>
        `;
    }
}

function renderProductosVenta(productos) {
    if (!productos || Object.keys(productos).length === 0) {
        return "Sin detalle de productos";
    }

    return Object.values(productos)
        .map(producto => `${producto.nombre} x${producto.cantidad}`)
        .join(", ");
}

function formatearFormaPago(formaPago) {
    if (!formaPago || formaPago === "efectivo") return "Efectivo";
    if (formaPago === "transferencia") return "Transferencia";
    if (formaPago === "tarjeta") return "Tarjeta";
    return formaPago;
}

function ventaCoincideBusqueda(venta, busqueda) {
    if (!busqueda) return true;
    const texto = renderProductosVenta(venta.productos).toLowerCase();
    return texto.includes(busqueda.toLowerCase());
}

function formatearFechaVenta(venta) {
    if (venta.fecha instanceof Date) {
        return venta.fecha.toLocaleString("es-ES");
    }

    return venta.fecha && venta.fecha.toDate ?
        venta.fecha.toDate().toLocaleString("es-ES") :
        new Date(venta.fecha.seconds * 1000).toLocaleString("es-ES");
}

function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function generarTextoTicket(venta) {
    const productos = Object.values(venta.productos || {});
    const lineasProductos = productos.map(producto => {
        const subtotal = centavosAImporte(importeACentavos(producto.precio) * producto.cantidad).toFixed(2);
        return `${producto.nombre} x${producto.cantidad} - $${subtotal}`;
    }).join("\n");

    return [
        "JUGUETERIA CATI",
        "Ticket de venta",
        "------------------------------",
        `Fecha: ${formatearFechaVenta(venta)}`,
        lineasProductos || "Sin detalle de productos",
        "------------------------------",
        `TOTAL: $${normalizarImporte(venta.total).toFixed(2)}`,
        "",
        "Gracias por su compra!"
    ].join("\n");
}

function abrirTicket(venta) {
    const ventana = window.open("", "_blank", "width=380,height=620");
    if (!ventana) {
        alert("El navegador bloqueo la ventana de impresion.");
        return;
    }

    ventana.document.write(`
        <html>
            <head>
                <title>Ticket</title>
                <style>
                    body { font-family: monospace; padding: 18px; white-space: pre-wrap; }
                    button { margin-top: 18px; padding: 10px 14px; }
                </style>
            </head>
            <body>
                <pre>${escaparHtml(generarTextoTicket(venta))}</pre>
                <button onclick="window.print()">Imprimir</button>
            </body>
        </html>
    `);
    ventana.document.close();
}

window.imprimirVenta = function (id) {
    const venta = ventasCache.find(item => item.id === id) || ultimoTicket;
    if (!venta) {
        alert("No se encontro la venta para imprimir.");
        return;
    }

    abrirTicket(venta);
};

// ELIMINAR ITEM DEL CARRITO
window.eliminarItem = function (id) {
    delete carrito[id];
    calcularTotal();
    renderCarrito();
};

// MODAL FORMA DE PAGO
window.mostrarModalPago = function () {
    if (Object.keys(carrito).length === 0) {
        alert("El carrito esta vacio");
        return;
    }
    document.getElementById("modalPago").style.display = "flex";
};

window.cerrarModalPago = function () {
    document.getElementById("modalPago").style.display = "none";
};

window.confirmarFormaPago = async function (metodo) {
    cerrarModalPago();
    await finalizarVenta(metodo);
};

// FINALIZAR VENTA
window.finalizarVenta = async function (formaPago) {
    if (Object.keys(carrito).length === 0) {
        alert("El carrito esta vacio");
        return;
    }

    if (!formaPago) {
        alert("Tenes que seleccionar la forma de pago antes de finalizar la venta");
        return;
    }

    try {
        const totalVenta = normalizarImporte(total);

        const ventaData = {
            productos: { ...carrito },
            total: totalVenta,
            items: Object.keys(carrito).length,
            fecha: new Date(),
            formaPago
        };

        const ventaRef = await addDoc(collection(db, "ventas"), ventaData);
        ultimoTicket = { id: ventaRef.id, ...ventaData };

        carrito = {};
        total = 0;
        renderCarrito();
        calcularTotal();

        alert(`Venta exitosa por $${totalVenta.toFixed(2)}!`);
        if (confirm("Quieres imprimir el ticket?")) {
            abrirTicket(ultimoTicket);
        }

    } catch (error) {
        console.error("Error en venta:", error);
        alert("Error al procesar la venta: " + error.message);
    }
};

async function crearSolicitudVenta(tipo, ventaId, datosExtra = {}) {
    const usuarioActual = auth.currentUser;
    if (!usuarioActual) {
        throw new Error("Tenes que iniciar sesion para enviar solicitudes.");
    }

    if (tipo !== "editar" && tipo !== "eliminar") {
        throw new Error("Tipo de solicitud invalido.");
    }

    const ventaEnCache = ventasCache.find(venta => venta.id === ventaId);
    let venta = ventaEnCache;

    if (!venta) {
        const ventaSnap = await getDoc(doc(db, "ventas", ventaId));
        if (!ventaSnap.exists()) {
            throw new Error("No se encontro la venta.");
        }
        venta = { id: ventaSnap.id, ...ventaSnap.data() };
    }

    const solicitud = {
        tipo,
        ventaId,
        ventaTotal: normalizarImporte(venta.total),
        ventaItems: venta.items || Object.keys(venta.productos || {}).length,
        ventaProductos: venta.productos || {},
        solicitadoPor: usuarioActual.email,
        fechaSolicitud: new Date(),
        estado: "pendiente"
    };

    if (tipo === "editar") {
        solicitud.nuevoTotal = normalizarImporte(datosExtra.nuevoTotal);
    }

    await addDoc(collection(db, "solicitudes"), solicitud);
}

// EDITAR VENTA
window.editarVenta = async function (id, totalActual) {
    const esDueno = usuarioActualEsDueno();
    const totalIngresado = prompt("Nuevo total de la venta:", totalActual);
    if (totalIngresado === null) {
        return;
    }

    const totalNumero = Number(totalIngresado);

    if (isNaN(totalNumero) || totalNumero < 0) {
        alert("Ingresa un total valido.");
        return;
    }

    const nuevoTotal = normalizarImporte(totalNumero);

    if (!esDueno) {
        try {
            await crearSolicitudVenta("editar", id, { nuevoTotal });
            alert("Solicitud enviada al dueno.");
        } catch (error) {
            alert("Error al enviar la solicitud: " + error.message);
        }
        return;
    }

    try {
        await updateDoc(doc(db, "ventas", id), {
            total: nuevoTotal,
            editada: true,
            editadaEn: new Date()
        });
        alert("Venta editada correctamente.");
    } catch (error) {
        alert("Error al editar la venta: " + error.message);
    }
};

// ELIMINAR VENTA
window.eliminarVenta = async function (id) {
    const esDueno = usuarioActualEsDueno();

    if (!esDueno) {
        if (!confirm("Enviar solicitud al dueno para eliminar esta venta?")) {
            return;
        }

        try {
            await crearSolicitudVenta("eliminar", id);
            alert("Solicitud enviada al dueno.");
        } catch (error) {
            alert("Error al enviar la solicitud: " + error.message);
        }
        return;
    }

    if (!confirm("Seguro que quieres eliminar esta venta? Esta accion no se puede deshacer.")) {
        return;
    }

    try {
        await deleteDoc(doc(db, "ventas", id));
        alert("Venta eliminada correctamente.");
    } catch (error) {
        alert("Error al eliminar la venta: " + error.message);
    }
};

// CARGAR HISTORIAL DE VENTAS
function cargarVentas() {
    if (ventasUnsubscribe) ventasUnsubscribe();
    cantidadVentasVisibles = CANTIDAD_VENTAS_POR_PAGINA;
    const fechaSeleccionada = fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO();
    const { inicio, fin } = rangoDelDia(fechaSeleccionada);

    ventasUnsubscribe = onSnapshot(
        query(
            collection(db, "ventas"),
            where("fecha", ">=", inicio),
            where("fecha", "<", fin),
            orderBy("fecha", "desc")
        ),
        (snapshot) => {
            ventasDiv.innerHTML = "";
            ventasCache = [];

            if (snapshot.empty) {
                ventasDiv.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em;">No hay ventas registradas para esta fecha</p>';
                renderCaja();
                return;
            }

            snapshot.forEach(docu => {
                const data = docu.data();
                data.total = normalizarImporte(data.total);
                ventasCache.push({ id: docu.id, ...data });
            });

            renderVentas();
            renderCaja();
        },
        (error) => {
            console.error("Error cargando ventas:", error);
            ventasDiv.innerHTML = '<p style="color: red;">Error cargando ventas</p>';
        }
    );
}

window.cambiarFechaVentas = function () {
    cargarVentas();
    if (periodoEstadisticasSelect && periodoEstadisticasSelect.value === "dia") {
        cargarEstadisticas();
    }
};

function renderVentas() {
    if (!ventasDiv) return;

    const busqueda = buscarVentaInput ? buscarVentaInput.value.trim() : "";
    const ventasFiltradas = ventasCache.filter(venta => ventaCoincideBusqueda(venta, busqueda));
    const ventasMostradas = ventasFiltradas.slice(0, cantidadVentasVisibles);
    const ventasTotal = normalizarImporte(
        ventasFiltradas.reduce((acumulado, venta) => acumulado + normalizarImporte(venta.total), 0)
    );

    ventasDiv.innerHTML = ventasMostradas.map(venta => {
        const fecha = formatearFechaVenta(venta);
        const detalleProductos = renderProductosVenta(venta.productos);

        return `
            <div class="item venta-item">
                <div>
                    <strong>$${venta.total.toFixed(2)}</strong><br>
                    <small>${fecha} - ${venta.items} productos - ${formatearFormaPago(venta.formaPago)}</small><br>
                    <small>${detalleProductos}</small>
                    ${venta.editada ? "<br><small>Venta editada por el dueno</small>" : ""}
                </div>
                <div class="acciones-venta">
                    <button class="btn btn-secondary" onclick="editarVenta('${venta.id}', ${venta.total})">
                        Editar
                    </button>
                    <button class="btn btn-danger" onclick="eliminarVenta('${venta.id}')">
                        Eliminar
                    </button>
                    <button class="btn btn-secondary" onclick="imprimirVenta('${venta.id}')">
                        Ticket
                    </button>
                </div>
            </div>
        `;
    }).join("");

    ventasDiv.innerHTML += `
        <div class="item total-ventas-item">
            <strong>TOTAL VENTAS: $${ventasTotal.toFixed(2)}</strong>
            <small>(${ventasFiltradas.length} ventas mostradas)</small>
        </div>
    `;

    if (cantidadVentasVisibles < ventasFiltradas.length) {
        ventasDiv.innerHTML += `
            <button class="btn btn-secondary ver-mas-btn" onclick="verMasVentas()">
                Ver mas ventas
            </button>
        `;
    }
}

window.verMasVentas = function () {
    cantidadVentasVisibles += CANTIDAD_VENTAS_POR_PAGINA;
    renderVentas();
};

window.buscarVentas = function () {
    cantidadVentasVisibles = CANTIDAD_VENTAS_POR_PAGINA;
    renderVentas();
};

function limpiarCsv(valor) {
    return `"${String(valor ?? "").replace(/"/g, '""')}"`;
}

window.exportarVentasCSV = function () {
    if (ventasCache.length === 0) {
        alert("No hay ventas para exportar en esta fecha.");
        return;
    }

    const encabezados = ["Fecha", "Total", "Items", "Forma de pago", "Productos", "Editada"];
    const filas = ventasCache.map(venta => {
        const fecha = venta.fecha.toDate ?
            venta.fecha.toDate().toLocaleString("es-ES") :
            new Date(venta.fecha.seconds * 1000).toLocaleString("es-ES");

        return [
            limpiarCsv(fecha),
            limpiarCsv(venta.total.toFixed(2)),
            limpiarCsv(venta.items),
            limpiarCsv(formatearFormaPago(venta.formaPago)),
            limpiarCsv(renderProductosVenta(venta.productos)),
            limpiarCsv(venta.editada ? "Si" : "No")
        ].join(",");
    });

    const csv = [encabezados.join(","), ...filas].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const fechaSeleccionada = fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO();

    link.href = url;
    link.download = `ventas-${fechaSeleccionada}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};

function resumenVentasDelDia() {
    const totalDia = normalizarImporte(
        ventasCache.reduce((acumulado, venta) => acumulado + normalizarImporte(venta.total), 0)
    );
    const unidades = ventasCache.reduce((acumulado, venta) => {
        return acumulado + Object.values(venta.productos || {}).reduce((suma, producto) => suma + (producto.cantidad || 0), 0);
    }, 0);

    return {
        fecha: fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO(),
        ventas: ventasCache.length,
        unidades,
        total: totalDia
    };
}

function fechaHoraLocalISO(fecha) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, "0");
    const day = String(fecha.getDate()).padStart(2, "0");
    const hours = String(fecha.getHours()).padStart(2, "0");
    const minutes = String(fecha.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function fechaHoraParaInput(fechaISO, hora) {
    return new Date(`${fechaISO}T${hora}:00`);
}

function obtenerConfiguracionCaja() {
    const fecha = document.getElementById("fechaCaja")?.value ||
        (fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO());
    const horaInicio = document.getElementById("horaInicioCaja")?.value || "08:30";
    const horaFin = document.getElementById("horaFinCaja")?.value || "16:00";
    const turno = document.getElementById("turnoCaja")?.value || "manana";
    const inicio = fechaHoraParaInput(fecha, horaInicio);
    const fin = fechaHoraParaInput(fecha, horaFin);

    if (fin <= inicio) {
        fin.setDate(fin.getDate() + 1);
    }

    return { fecha, horaInicio, horaFin, turno, inicio, fin };
}

async function obtenerVentasCaja(inicio, fin) {
    const snapshot = await getDocs(
        query(
            collection(db, "ventas"),
            where("fecha", ">=", inicio),
            where("fecha", "<", fin),
            orderBy("fecha", "desc")
        )
    );

    return snapshot.docs.map(docu => {
        const data = docu.data();
        return { id: docu.id, ...data, total: normalizarImporte(data.total) };
    });
}

function resumirVentasCaja(ventas, config) {
    const total = normalizarImporte(
        ventas.reduce((acumulado, venta) => acumulado + normalizarImporte(venta.total), 0)
    );
    const unidades = ventas.reduce((acumulado, venta) => {
        return acumulado + Object.values(venta.productos || {}).reduce((suma, producto) => suma + (producto.cantidad || 0), 0);
    }, 0);
    const efectivo = normalizarImporte(
        ventas.reduce((acumulado, venta) => (!venta.formaPago || venta.formaPago === "efectivo") ? acumulado + normalizarImporte(venta.total) : acumulado, 0)
    );
    const transferencia = normalizarImporte(
        ventas.reduce((acumulado, venta) => venta.formaPago === "transferencia" ? acumulado + normalizarImporte(venta.total) : acumulado, 0)
    );
    const tarjeta = normalizarImporte(
        ventas.reduce((acumulado, venta) => venta.formaPago === "tarjeta" ? acumulado + normalizarImporte(venta.total) : acumulado, 0)
    );

    return {
        fecha: config.fecha,
        turno: config.turno,
        horaInicio: config.horaInicio,
        horaFin: config.horaFin,
        rangoInicio: config.inicio,
        rangoFin: config.fin,
        rangoInicioTexto: fechaHoraLocalISO(config.inicio),
        rangoFinTexto: fechaHoraLocalISO(config.fin),
        ventas: ventas.length,
        unidades,
        total,
        efectivo,
        transferencia,
        tarjeta
    };
}

async function calcularResumenCaja() {
    const config = obtenerConfiguracionCaja();
    const ventas = await obtenerVentasCaja(config.inicio, config.fin);
    return resumirVentasCaja(ventas, config);
}

function renderControlesCaja(config) {
    return `
        <div class="ventas-toolbar">
            <div class="form-group">
                <label for="fechaCaja">Fecha de inicio:</label>
                <input type="date" id="fechaCaja" value="${config.fecha}" onchange="renderCaja()">
            </div>
            <div class="form-group">
                <label for="turnoCaja">Turno:</label>
                <select id="turnoCaja" onchange="aplicarTurnoCaja(this.value)">
                    <option value="manana" ${config.turno === "manana" ? "selected" : ""}>08:30 a 16:00</option>
                    <option value="manana-larga" ${config.turno === "manana-larga" ? "selected" : ""}>08:30 a 17:00</option>
                    <option value="tarde" ${config.turno === "tarde" ? "selected" : ""}>16:00 a 22:30</option>
                    <option value="noche-corta" ${config.turno === "noche-corta" ? "selected" : ""}>22:30 a 01:00</option>
                    <option value="noche-larga" ${config.turno === "noche-larga" ? "selected" : ""}>22:30 a 02:00</option>
                    <option value="manual" ${config.turno === "manual" ? "selected" : ""}>Manual</option>
                </select>
            </div>
            <div class="form-group">
                <label for="horaInicioCaja">Desde:</label>
                <input type="time" id="horaInicioCaja" value="${config.horaInicio}" onchange="marcarTurnoManual(); renderCaja()">
            </div>
            <div class="form-group">
                <label for="horaFinCaja">Hasta:</label>
                <input type="time" id="horaFinCaja" value="${config.horaFin}" onchange="marcarTurnoManual(); renderCaja()">
            </div>
        </div>
    `;
}

async function renderCaja() {
    if (!cajaDiv) return;

    const config = obtenerConfiguracionCaja();
    cajaDiv.innerHTML = `${renderControlesCaja(config)}<p style="text-align: center; color: #666; font-size: 1.2em;">Calculando cierre...</p>`;

    let resumen;
    try {
        resumen = await calcularResumenCaja();
    } catch (error) {
        cajaDiv.innerHTML = `${renderControlesCaja(config)}<p style="color: red;">Error calculando caja: ${error.message}</p>`;
        return;
    }

    cajaDiv.innerHTML = `
        ${renderControlesCaja(resumen)}
        <p class="section-note">Periodo: ${resumen.rangoInicioTexto} hasta ${resumen.rangoFinTexto}</p>
        <div class="stats-resumen">
            <div class="stat-card">
                <span>Fecha inicio</span>
                <strong>${resumen.fecha}</strong>
            </div>
            <div class="stat-card">
                <span>Ventas del turno</span>
                <strong>${resumen.ventas}</strong>
            </div>
            <div class="stat-card">
                <span>Unidades vendidas</span>
                <strong>${resumen.unidades}</strong>
            </div>
            <div class="stat-card">
                <span>Total del turno</span>
                <strong>$${resumen.total.toFixed(2)}</strong>
            </div>
            <div class="stat-card">
                <span>Efectivo</span>
                <strong>$${resumen.efectivo.toFixed(2)}</strong>
            </div>
            <div class="stat-card">
                <span>Transferencia</span>
                <strong>$${resumen.transferencia.toFixed(2)}</strong>
            </div>
            <div class="stat-card">
                <span>Tarjeta</span>
                <strong>$${resumen.tarjeta.toFixed(2)}</strong>
            </div>
        </div>
        <button class="btn btn-primary cerrar-caja-btn" onclick="cerrarCajaDia()">
            Guardar cierre de caja
        </button>
    `;
}

window.renderCaja = renderCaja;

window.aplicarTurnoCaja = function (turno) {
    const horarios = {
        "manana": ["08:30", "16:00"],
        "manana-larga": ["08:30", "17:00"],
        "tarde": ["16:00", "22:30"],
        "noche-corta": ["22:30", "01:00"],
        "noche-larga": ["22:30", "02:00"]
    };

    if (horarios[turno]) {
        document.getElementById("horaInicioCaja").value = horarios[turno][0];
        document.getElementById("horaFinCaja").value = horarios[turno][1];
    }

    renderCaja();
};

window.marcarTurnoManual = function () {
    const turnoCaja = document.getElementById("turnoCaja");
    if (turnoCaja) turnoCaja.value = "manual";
};

window.cerrarCajaDia = async function () {
    const usuarioActual = auth.currentUser;
    if (!usuarioActual) {
        alert("Tenes que iniciar sesion para cerrar caja.");
        return;
    }

    let resumen;
    try {
        resumen = await calcularResumenCaja();
    } catch (error) {
        alert("Error al calcular la caja: " + error.message);
        return;
    }

    if (!confirm(`Guardar cierre de caja de ${resumen.rangoInicioTexto} a ${resumen.rangoFinTexto} por $${resumen.total.toFixed(2)}?`)) {
        return;
    }

    try {
        const emailSeguro = usuarioActual.email.replace(/[^a-z0-9]/gi, "_").toLowerCase();
        const cierreId = `${resumen.fecha}_${resumen.horaInicio.replace(":", "")}_${resumen.horaFin.replace(":", "")}_${emailSeguro}`;
        await setDoc(doc(db, "cierresCaja", cierreId), {
            ...resumen,
            cerradoEn: new Date(),
            cerradoPor: usuarioActual.email
        });
    } catch (error) {
        alert("Error al cerrar caja: " + error.message);
        return;
    }

    alert("Cierre de caja guardado.");
};

function cargarEstadisticas() {
    if (estadisticasUnsubscribe) estadisticasUnsubscribe();
    if (!estadisticasDiv) return;

    estadisticasCache = [];
    const rango = rangoEstadisticas();
    if (rango && rango.invalido) {
        estadisticasDiv.innerHTML = '<p style="color: red;">La fecha hasta tiene que ser igual o posterior a la fecha desde.</p>';
        return;
    }

    const consultaEstadisticas = rango ?
        query(
            collection(db, "ventas"),
            where("fecha", ">=", rango.inicio),
            where("fecha", "<", rango.fin),
            orderBy("fecha", "desc")
        ) :
        query(collection(db, "ventas"), orderBy("fecha", "desc"));

    estadisticasUnsubscribe = onSnapshot(
        consultaEstadisticas,
        (snapshot) => {
            estadisticasCache = [];

            snapshot.forEach(docu => {
                const data = docu.data();
                data.total = normalizarImporte(data.total);
                estadisticasCache.push({ id: docu.id, ...data });
            });

            renderEstadisticas();
        },
        (error) => {
            console.error("Error cargando estadisticas:", error);
            estadisticasDiv.innerHTML = '<p style="color: red;">Error cargando estadisticas</p>';
        }
    );
}

window.cambiarPeriodoEstadisticas = function () {
    const esRango = periodoEstadisticasSelect && periodoEstadisticasSelect.value === "rango";
    if (rangoEstadisticasCampos) {
        rangoEstadisticasCampos.style.display = esRango ? "contents" : "none";
    }

    if (esRango) {
        const fechaBase = fechaVentasInput && fechaVentasInput.value ? fechaVentasInput.value : fechaLocalISO();
        if (fechaEstadisticasDesdeInput && !fechaEstadisticasDesdeInput.value) {
            fechaEstadisticasDesdeInput.value = fechaBase;
        }
        if (fechaEstadisticasHastaInput && !fechaEstadisticasHastaInput.value) {
            fechaEstadisticasHastaInput.value = fechaBase;
        }
    }

    cargarEstadisticas();
};

window.cambiarRangoEstadisticas = function () {
    if (periodoEstadisticasSelect && periodoEstadisticasSelect.value !== "rango") {
        periodoEstadisticasSelect.value = "rango";
    }
    window.cambiarPeriodoEstadisticas();
};

// CARGAR SOLICITUDES DEL DUENO
function cargarSolicitudes() {
    if (solicitudesUnsubscribe) solicitudesUnsubscribe();
    if (!solicitudesDiv) return;

    if (!usuarioActualEsDueno()) {
        solicitudesDiv.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em;">Solo el dueno puede ver las solicitudes.</p>';
        return;
    }

    solicitudesUnsubscribe = onSnapshot(
        query(collection(db, "solicitudes"), orderBy("fechaSolicitud", "desc")),
        (snapshot) => {
            const solicitudesPendientes = [];

            snapshot.forEach(docu => {
                const data = docu.data();
                if (data.estado === "pendiente") {
                    solicitudesPendientes.push({ id: docu.id, ...data });
                }
            });

            if (solicitudesPendientes.length === 0) {
                solicitudesDiv.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em;">No hay solicitudes pendientes.</p>';
                return;
            }

            solicitudesDiv.innerHTML = solicitudesPendientes.map(solicitud => {
                const fecha = solicitud.fechaSolicitud && solicitud.fechaSolicitud.toDate ?
                    solicitud.fechaSolicitud.toDate().toLocaleString("es-ES") :
                    "Fecha no disponible";
                const detalle = solicitud.tipo === "editar" ?
                    `Editar total: $${solicitud.ventaTotal.toFixed(2)} -> $${solicitud.nuevoTotal.toFixed(2)}` :
                    `Eliminar venta por $${solicitud.ventaTotal.toFixed(2)}`;

                return `
                    <div class="item solicitud-item">
                        <div>
                            <strong>${detalle}</strong><br>
                            <small>Empleado: ${solicitud.solicitadoPor}</small><br>
                            <small>${fecha} - ${solicitud.ventaItems} productos</small><br>
                            <small>${renderProductosVenta(solicitud.ventaProductos)}</small>
                        </div>
                        <div class="acciones-venta">
                            <button class="btn btn-primary" onclick="aceptarSolicitud('${solicitud.id}')">
                                Aceptar
                            </button>
                            <button class="btn btn-danger" onclick="rechazarSolicitud('${solicitud.id}')">
                                Rechazar
                            </button>
                        </div>
                    </div>
                `;
            }).join("");
        },
        (error) => {
            console.error("Error cargando solicitudes:", error);
            solicitudesDiv.innerHTML = '<p style="color: red;">Error cargando solicitudes</p>';
        }
    );
}

window.aceptarSolicitud = async function (solicitudId) {
    if (!usuarioActualEsDueno()) {
        alert("Solo el dueno puede aceptar solicitudes.");
        return;
    }

    try {
        const solicitudRef = doc(db, "solicitudes", solicitudId);
        const solicitudSnap = await getDoc(solicitudRef);

        if (!solicitudSnap.exists()) {
            alert("La solicitud ya no existe.");
            return;
        }

        const solicitud = solicitudSnap.data();
        if (solicitud.estado !== "pendiente") {
            alert("Esta solicitud ya fue resuelta.");
            return;
        }

        if (solicitud.tipo === "editar") {
            await updateDoc(doc(db, "ventas", solicitud.ventaId), {
                total: solicitud.nuevoTotal,
                editada: true,
                editadaEn: new Date(),
                editadaPor: auth.currentUser.email
            });
        }

        if (solicitud.tipo === "eliminar") {
            await deleteDoc(doc(db, "ventas", solicitud.ventaId));
        }

        await updateDoc(solicitudRef, {
            estado: "aceptada",
            resueltaEn: new Date(),
            resueltaPor: auth.currentUser.email
        });

        alert("Solicitud aceptada correctamente.");
    } catch (error) {
        alert("Error al aceptar la solicitud: " + error.message);
    }
};

window.rechazarSolicitud = async function (solicitudId) {
    if (!usuarioActualEsDueno()) {
        alert("Solo el dueno puede rechazar solicitudes.");
        return;
    }

    if (!confirm("Seguro que quieres rechazar esta solicitud?")) {
        return;
    }

    try {
        await updateDoc(doc(db, "solicitudes", solicitudId), {
            estado: "rechazada",
            resueltaEn: new Date(),
            resueltaPor: auth.currentUser.email
        });

        alert("Solicitud rechazada.");
    } catch (error) {
        alert("Error al rechazar la solicitud: " + error.message);
    }
};

// ESTADISTICAS DE PRODUCTOS MAS VENDIDOS
function renderEstadisticas() {
    if (!estadisticasDiv) return;

    const productos = {};
    let totalUnidades = 0;
    let totalFacturado = 0;

    let totalEfectivo = 0;
    let totalTransferencia = 0;
    let totalTarjeta = 0;

    estadisticasCache.forEach(venta => {
        totalFacturado += venta.total || 0;

        // 👉 separar por forma de pago
        if (!venta.formaPago || venta.formaPago === "efectivo") {
            totalEfectivo += venta.total || 0;
        } else if (venta.formaPago === "transferencia") {
            totalTransferencia += venta.total || 0;
        } else if (venta.formaPago === "tarjeta") {
            totalTarjeta += venta.total || 0;
        }

        Object.values(venta.productos || {}).forEach(producto => {
            const nombre = producto.nombre || "Producto sin nombre";
            const cantidad = producto.cantidad || 0;
            const precio = normalizarImporte(producto.precio || 0);

            if (!productos[nombre]) {
                productos[nombre] = {
                    nombre,
                    cantidad: 0,
                    facturado: 0
                };
            }

            productos[nombre].cantidad += cantidad;
            productos[nombre].facturado = normalizarImporte(
                productos[nombre].facturado + centavosAImporte(importeACentavos(precio) * cantidad)
            );
            totalUnidades += cantidad;
        });
    });

    const ranking = Object.values(productos)
        .sort((a, b) => b.cantidad - a.cantidad || b.facturado - a.facturado);

    if (ranking.length === 0) {
        estadisticasDiv.innerHTML = '<p style="text-align: center; color: #666; font-size: 1.2em;">Todavia no hay datos para mostrar.</p>';
        return;
    }

    estadisticasDiv.innerHTML = `
        <div class="stats-resumen">
            <div class="stat-card">
                <span>Ventas registradas</span>
                <strong>${estadisticasCache.length}</strong>
            </div>
            <div class="stat-card">
                <span>Unidades vendidas</span>
                <strong>${totalUnidades}</strong>
            </div>
            <div class="stat-card">
                <span>Total vendido</span>
                <strong>$${totalFacturado.toFixed(2)}</strong>
            </div>

            <!-- 👇 NUEVO -->
            <div class="stat-card">
                <span>Efectivo</span>
                <strong>$${totalEfectivo.toFixed(2)}</strong>
            </div>
            <div class="stat-card">
                <span>Transferencia</span>
                <strong>$${totalTransferencia.toFixed(2)}</strong>
            </div>
            <div class="stat-card">
                <span>Tarjeta</span>
                <strong>$${totalTarjeta.toFixed(2)}</strong>
            </div>
        </div>

        <div class="ranking-lista">
            ${ranking.map((producto, index) => {
                const porcentaje = totalUnidades > 0 ? (producto.cantidad / totalUnidades) * 100 : 0;

                return `
                    <div class="ranking-item">
                        <div class="ranking-info">
                            <strong>#${index + 1} ${producto.nombre}</strong>
                            <small>${producto.cantidad} unidades - $${producto.facturado.toFixed(2)}</small>
                        </div>
                        <div class="ranking-barra">
                            <span style="width: ${porcentaje}%"></span>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

// ATAJOS DE TECLADO
document.addEventListener("keydown", function(e) {
    if (e.key === "Enter" && loginDiv.classList.contains("active")) {
        login();
    }

    if (appDiv.style.display !== "none") {
        switch(e.key) {
            case "F1":
                mostrarSeccion("productos");
                break;
            case "F2":
                mostrarSeccion("carrito");
                break;
            case "F3":
                mostrarSeccion("ventas");
                break;
            case "F4":
                mostrarSeccion("estadisticas");
                break;
            case "F5":
                if (usuarioActualEsDueno()) mostrarSeccion("solicitudes");
                break;
            case "F6":
                if (usuarioActualEsDueno()) {
                    renderCaja();
                    mostrarSeccion("caja");
                }
                break;
        }
    }
});

// INICIALIZACION
console.log("Jugueteria CATI- Sistema POS cargado correctamente!");
console.log("Atajos: F1=Productos, F2=Carrito, F3=Ventas, F4=Estadisticas, F5=Solicitudes, F6=Caja, Enter=Login");

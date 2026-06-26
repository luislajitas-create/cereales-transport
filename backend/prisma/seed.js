/* eslint-disable */
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Sembrando datos de demostración...");

  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  const usuarios = await Promise.all(
    [
      { nombre: "Admin General", email: "admin@demo.com", rol: "ADMINISTRADOR" },
      { nombre: "Gerencia Demo", email: "gerencia@demo.com", rol: "GERENCIA" },
      { nombre: "Operaciones Demo", email: "operaciones@demo.com", rol: "OPERACIONES" },
      { nombre: "Liquidaciones Demo", email: "liquidaciones@demo.com", rol: "LIQUIDACIONES" },
      { nombre: "Facturacion Demo", email: "facturacion@demo.com", rol: "FACTURACION" },
      { nombre: "Lectura Demo", email: "lectura@demo.com", rol: "LECTURA" },
    ].map((u) =>
      prisma.usuario.upsert({
        where: { email: u.email },
        update: {},
        create: { ...u, passwordHash },
      }),
    ),
  );

  const [cerealSoja, cerealMaiz, cerealTrigo] = await Promise.all([
    prisma.cereal.upsert({ where: { nombre: "Soja" }, update: {}, create: { nombre: "Soja" } }),
    prisma.cereal.upsert({ where: { nombre: "Maíz" }, update: {}, create: { nombre: "Maíz" } }),
    prisma.cereal.upsert({ where: { nombre: "Trigo" }, update: {}, create: { nombre: "Trigo" } }),
  ]);

  const ubicaciones = await Promise.all(
    [
      { nombre: "Acopio San Martín", tipo: "ACOPIO", localidad: "Pergamino" },
      { nombre: "Acopio La Esperanza", tipo: "ACOPIO", localidad: "Junín" },
      { nombre: "Planta Aceitera Rosario", tipo: "PLANTA", localidad: "Rosario" },
      { nombre: "Puerto San Lorenzo", tipo: "PUERTO", localidad: "San Lorenzo" },
      { nombre: "Campo El Mirador", tipo: "CAMPO", localidad: "Pergamino" },
    ].map((u) => prisma.ubicacion.create({ data: u })),
  );
  const [acopioSanMartin, acopioLaEsperanza, plantaRosario, puertoSanLorenzo, campoElMirador] = ubicaciones;

  const tiposGasto = await Promise.all(
    [
      { nombre: "Anticipo en efectivo", afectaLiquidacion: true },
      { nombre: "Combustible (YPF Ruta)", afectaLiquidacion: true },
      { nombre: "Peaje", afectaLiquidacion: true },
      { nombre: "Adelanto quincenal", afectaLiquidacion: true },
      { nombre: "Multa / descuento administrativo", afectaLiquidacion: true },
    ].map((t) => prisma.tipoGasto.upsert({ where: { nombre: t.nombre }, update: {}, create: t })),
  );
  const [tgAnticipoEfectivo, tgCombustible, tgPeaje, tgAdelantoQuincenal] = tiposGasto;

  const clientes = await Promise.all([
    prisma.cliente.upsert({
      where: { cuit: "30-12345678-9" },
      update: {},
      create: {
        razonSocial: "Aceitera del Litoral S.A.",
        cuit: "30-12345678-9",
        condicionesComerciales: "Pago a 30 días desde fecha de factura",
        contactos: { create: [{ nombre: "María López", telefono: "341-4000111", email: "mlopez@aceiteralitoral.com" }] },
      },
    }),
    prisma.cliente.upsert({
      where: { cuit: "30-98765432-1" },
      update: {},
      create: {
        razonSocial: "Exportadora del Sur S.R.L.",
        cuit: "30-98765432-1",
        condicionesComerciales: "Pago a 15 días desde fecha de factura",
        contactos: { create: [{ nombre: "Jorge Pérez", telefono: "11-5550022", email: "jperez@expsur.com" }] },
      },
    }),
  ]);
  const [clienteAceitera, clienteExportadora] = clientes;

  const productores = await Promise.all(
    [
      { nombre: "Estancia La Aurora", cuit: "20-11122233-4", localidad: "Pergamino" },
      { nombre: "Establecimiento Don Carlos", cuit: "20-44455566-7", localidad: "Junín" },
    ].map((p) => prisma.productor.create({ data: p })),
  );
  const [productorAurora, productorDonCarlos] = productores;

  const transportistas = await Promise.all([
    prisma.transportista.upsert({
      where: { cuit: "30-55566677-8" },
      update: {},
      create: { razonSocial: "Transportes Rápido S.A.", cuit: "30-55566677-8", domicilio: "Ruta 8 Km 220" },
    }),
    prisma.transportista.upsert({
      where: { cuit: "30-77788899-0" },
      update: {},
      create: { razonSocial: "Logística del Norte S.R.L.", cuit: "30-77788899-0", domicilio: "Av. San Martín 1234" },
    }),
  ]);
  const [transRapido, transNorte] = transportistas;

  const choferes = await Promise.all([
    prisma.chofer.upsert({
      where: { cuil: "20-30111222-3" },
      update: {},
      create: { transportistaId: transRapido.id, nombre: "Carlos Gómez", dni: "30111222", cuil: "20-30111222-3", licenciaNumero: "B1234567" },
    }),
    prisma.chofer.upsert({
      where: { cuil: "20-32444555-6" },
      update: {},
      create: { transportistaId: transRapido.id, nombre: "Roberto Díaz", dni: "32444555", cuil: "20-32444555-6", licenciaNumero: "B7654321" },
    }),
    prisma.chofer.upsert({
      where: { cuil: "20-28999888-1" },
      update: {},
      create: { transportistaId: transNorte.id, nombre: "Miguel Sosa", dni: "28999888", cuil: "20-28999888-1", licenciaNumero: "B1111222" },
    }),
  ]);
  const [choferGomez, choferDiaz, choferSosa] = choferes;

  const vehiculos = await Promise.all([
    prisma.vehiculo.upsert({
      where: { patente: "AB123CD" },
      update: {},
      create: { transportistaId: transRapido.id, patente: "AB123CD", marca: "Scania", modelo: "R450", tipo: "CAMION", capacidadKg: 30000 },
    }),
    prisma.vehiculo.upsert({
      where: { patente: "AC456EF" },
      update: {},
      create: { transportistaId: transRapido.id, patente: "AC456EF", marca: "Genérico", modelo: "Bitren", tipo: "ACOPLADO", capacidadKg: 28000 },
    }),
    prisma.vehiculo.upsert({
      where: { patente: "AD789GH" },
      update: {},
      create: { transportistaId: transNorte.id, patente: "AD789GH", marca: "Mercedes-Benz", modelo: "Axor", tipo: "CAMION", capacidadKg: 28000 },
    }),
  ]);
  const [camion1, acoplado1, camion2] = vehiculos;

  const adminUser = usuarios[0];

  function dias(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  }

  const viajesData = [
    { fecha: dias(20), cartaPorte: "0001-00012345", ctg: "CTG-0001", cerealId: cerealSoja.id, clienteId: clienteAceitera.id, productorId: productorAurora.id, transportistaId: transRapido.id, choferId: choferGomez.id, camionId: camion1.id, acopladoId: acoplado1.id, origenId: campoElMirador.id, destinoId: acopioSanMartin.id, toneladas: 30, tarifaTonelada: 8500, estadoFinal: "DESCARGADO" },
    { fecha: dias(18), cartaPorte: "0001-00012346", ctg: "CTG-0002", cerealId: cerealMaiz.id, clienteId: clienteAceitera.id, productorId: productorDonCarlos.id, transportistaId: transRapido.id, choferId: choferDiaz.id, camionId: camion1.id, acopladoId: null, origenId: acopioLaEsperanza.id, destinoId: plantaRosario.id, toneladas: 28, tarifaTonelada: 7200, estadoFinal: "DESCARGADO" },
    { fecha: dias(15), cartaPorte: "0001-00012347", ctg: "CTG-0003", cerealId: cerealTrigo.id, clienteId: clienteExportadora.id, productorId: productorAurora.id, transportistaId: transNorte.id, choferId: choferSosa.id, camionId: camion2.id, acopladoId: null, origenId: acopioSanMartin.id, destinoId: puertoSanLorenzo.id, toneladas: 27.5, tarifaTonelada: 9100, estadoFinal: "DESCARGADO" },
    { fecha: dias(10), cartaPorte: "0001-00012348", ctg: "CTG-0004", cerealId: cerealSoja.id, clienteId: clienteExportadora.id, productorId: null, transportistaId: transNorte.id, choferId: choferSosa.id, camionId: camion2.id, acopladoId: null, origenId: acopioLaEsperanza.id, destinoId: puertoSanLorenzo.id, toneladas: 29, tarifaTonelada: 8700, estadoFinal: "EN_TRANSITO" },
    { fecha: dias(3), cartaPorte: "0001-00012349", ctg: "CTG-0005", cerealId: cerealMaiz.id, clienteId: clienteAceitera.id, productorId: productorDonCarlos.id, transportistaId: transRapido.id, choferId: choferGomez.id, camionId: camion1.id, acopladoId: acoplado1.id, origenId: campoElMirador.id, destinoId: plantaRosario.id, toneladas: 30, tarifaTonelada: 7300, estadoFinal: "PENDIENTE" },
  ];

  const ordenEstados = ["PENDIENTE", "ASIGNADO", "EN_CARGA", "CARGADO", "EN_TRANSITO", "DESCARGADO"];

  const viajesCreados = [];
  for (const v of viajesData) {
    const { estadoFinal, ...data } = v;
    const importeTotal = data.toneladas * data.tarifaTonelada;
    const viaje = await prisma.viaje.create({
      data: { ...data, importeTotal, creadoPorId: adminUser.id },
    });
    await prisma.historialEstadoViaje.create({
      data: { viajeId: viaje.id, estadoAnterior: null, estadoNuevo: "PENDIENTE", usuarioId: adminUser.id },
    });
    const idxFinal = ordenEstados.indexOf(estadoFinal);
    let actual = viaje;
    for (let i = 1; i <= idxFinal; i++) {
      const anterior = ordenEstados[i - 1];
      const nuevo = ordenEstados[i];
      actual = await prisma.viaje.update({ where: { id: actual.id }, data: { estado: nuevo } });
      await prisma.historialEstadoViaje.create({
        data: { viajeId: actual.id, estadoAnterior: anterior, estadoNuevo: nuevo, usuarioId: adminUser.id },
      });
    }
    viajesCreados.push(actual);
  }

  // Anticipos y gastos para los choferes (pendientes de liquidar)
  await prisma.anticipoGasto.createMany({
    data: [
      { choferId: choferGomez.id, transportistaId: transRapido.id, tipoGastoId: tgAnticipoEfectivo.id, fecha: dias(19), importe: 50000, observaciones: "Adelanto para viaje CTG-0001", usuarioId: adminUser.id },
      { choferId: choferGomez.id, transportistaId: transRapido.id, tipoGastoId: tgCombustible.id, fecha: dias(17), importe: 35000, observaciones: "Combustible viaje CTG-0002", usuarioId: adminUser.id },
      { choferId: choferSosa.id, transportistaId: transNorte.id, tipoGastoId: tgPeaje.id, fecha: dias(14), importe: 8000, observaciones: "Peajes viaje CTG-0003", usuarioId: adminUser.id },
      { choferId: choferSosa.id, transportistaId: transNorte.id, tipoGastoId: tgAdelantoQuincenal.id, fecha: dias(5), importe: 60000, observaciones: "Adelanto quincenal", usuarioId: adminUser.id },
    ],
  });

  // Factura ya emitida y parcialmente cobrada (viaje 1 - CTG-0001) para tener cuenta corriente de ejemplo
  const viaje1 = viajesCreados[0];
  const factura1 = await prisma.factura.create({
    data: {
      clienteId: clienteAceitera.id,
      numero: "A-0001-00000123",
      fecha: dias(12),
      vencimiento: dias(-18),
      importe: viaje1.importeTotal,
    },
  });
  await prisma.facturaViaje.create({
    data: { facturaId: factura1.id, viajeId: viaje1.id, importeViaje: viaje1.importeTotal },
  });
  await prisma.viaje.update({ where: { id: viaje1.id }, data: { estadoFacturacion: "FACTURADO" } });
  await prisma.cobranza.create({
    data: { facturaId: factura1.id, fecha: dias(5), importe: viaje1.importeTotal * 0.5, medioPago: "Transferencia bancaria" },
  });
  await prisma.factura.update({ where: { id: factura1.id }, data: { estado: "COBRADO_PARCIAL" } });

  console.log("Datos de demostración cargados correctamente.");
  console.log("Usuarios de prueba (contraseña para todos: Demo1234!):");
  usuarios.forEach((u) => console.log(`  - ${u.email} (${u.rol})`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

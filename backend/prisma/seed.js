/* eslint-disable */
// Bloque 10.5 — subbloque técnico de recuperación del entorno de desarrollo. Reescrito para el
// schema multiempresa actual (el script anterior era previo a Bloque 8 y ya no era compatible:
// creaba Usuario/Cliente/etc. sin organizacionId, obligatorio desde entonces, y usaba claves
// únicas globales — cuit, cuil — que hoy son únicas por organización). No modifica
// schema.prisma, migraciones, controllers, services, DTO ni frontend — únicamente este archivo.
//
// Idempotente: se puede correr cualquier cantidad de veces sin duplicar nada. Ninguna clave
// única se asume global salvo donde el schema realmente la declara así (Organizacion.cuit,
// Usuario.email) — el resto se resuelve por su clave compuesta real ([organizacionId, ...]) o,
// donde el modelo no tiene ninguna clave de negocio (Organizacion.nombre, GrupoEconomico.nombre,
// IdentidadChoferGrupo.nombreReferencia, Ubicacion), por búsqueda explícita antes de crear.
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function buscarOCrearOrganizacion(nombre, datos) {
  const existente = await prisma.organizacion.findFirst({ where: { nombre } });
  if (existente) return prisma.organizacion.update({ where: { id: existente.id }, data: datos });
  return prisma.organizacion.create({ data: { nombre, ...datos } });
}

async function buscarOCrearGrupoEconomico(nombre) {
  const existente = await prisma.grupoEconomico.findFirst({ where: { nombre } });
  if (existente) return existente;
  return prisma.grupoEconomico.create({ data: { nombre } });
}

async function buscarOCrearIdentidadChoferGrupo(grupoEconomicoId, nombreReferencia) {
  const existente = await prisma.identidadChoferGrupo.findFirst({ where: { grupoEconomicoId, nombreReferencia } });
  if (existente) return existente;
  return prisma.identidadChoferGrupo.create({ data: { grupoEconomicoId, nombreReferencia } });
}

async function buscarOCrearUbicacion(organizacionId, nombre, tipo, localidad) {
  const existente = await prisma.ubicacion.findFirst({ where: { organizacionId, nombre } });
  if (existente) return existente;
  return prisma.ubicacion.create({ data: { organizacionId, nombre, tipo, localidad } });
}

// Cataloga lo mínimo indispensable para poder crear un Viaje y, sobre él, una Liquidacion de
// tipo CHOFER, dentro de UNA organización — Cliente, Cereal, dos Ubicaciones (origen/destino),
// Transportista, Vehiculo, y el Chofer real de esta organización (todavía sin vincular a
// IdentidadChoferGrupo, eso lo hace el llamador). Todo por clave única real de negocio, propia
// de cada organización — nunca por una clave global que el schema no garantiza.
async function sembrarCatalogoBase(organizacionId, sufijo, cuitBase, choferNombre, choferCuil, choferDni) {
  const cliente = await prisma.cliente.upsert({
    where: { organizacionId_cuit: { organizacionId, cuit: `30-${cuitBase}-1` } },
    update: {},
    create: { organizacionId, razonSocial: `Cliente Demo ${sufijo}`, cuit: `30-${cuitBase}-1` },
  });

  const cereal = await prisma.cereal.upsert({
    where: { organizacionId_nombre: { organizacionId, nombre: "Soja" } },
    update: {},
    create: { organizacionId, nombre: "Soja" },
  });

  const origen = await buscarOCrearUbicacion(organizacionId, `Acopio Demo ${sufijo}`, "ACOPIO", "Pergamino");
  const destino = await buscarOCrearUbicacion(organizacionId, `Planta Demo ${sufijo}`, "PLANTA", "Rosario");

  const transportista = await prisma.transportista.upsert({
    where: { organizacionId_cuit: { organizacionId, cuit: `30-${cuitBase}-2` } },
    update: {},
    create: { organizacionId, razonSocial: `Transportista Demo ${sufijo}`, cuit: `30-${cuitBase}-2` },
  });

  const vehiculo = await prisma.vehiculo.upsert({
    where: { organizacionId_patente: { organizacionId, patente: `AA${cuitBase}A` } },
    update: {},
    create: {
      organizacionId,
      transportistaId: transportista.id,
      patente: `AA${cuitBase}A`,
      marca: "Scania",
      modelo: "R450",
      tipo: "CAMION",
      capacidadKg: 30000,
    },
  });

  const chofer = await prisma.chofer.upsert({
    where: { organizacionId_cuil: { organizacionId, cuil: choferCuil } },
    update: {},
    create: {
      organizacionId,
      transportistaId: transportista.id,
      nombre: choferNombre,
      dni: choferDni,
      cuil: choferCuil,
      comisionPct: 10,
      licenciaNumero: `B${cuitBase}`,
    },
  });

  return { cliente, cereal, origen, destino, transportista, vehiculo, chofer };
}

// Crea, si no existe todavía, un Viaje DESCARGADO y una Liquidacion CHOFER ya CONFIRMADA sobre
// él — el estado mínimo que Bloque 10.5 necesita para poder buscar candidatos (candidatos()
// exige Liquidacion.estado === "CONFIRMADA"). Replica a mano, con la misma fórmula exacta, el
// cálculo que hoy hace LiquidacionesController (subtotal/comisionMonto/totalViaje en
// LiquidacionViaje; totalBruto/netoPagar en Liquidacion) — el seed no pasa por el controller
// real, así que tiene que reproducir su aritmética, no inventar una propia.
// creadoPorId queda null para toda organización donde no exista un Usuario real perteneciente a
// ella (la FK compuesta [creadoPorId, organizacionId] así lo exige) — nunca se fuerza el id de
// un usuario de otra organización.
async function sembrarLiquidacionConfirmada(organizacionId, catalogo, ctg, creadoPorId) {
  const existente = await prisma.liquidacion.findFirst({
    where: { organizacionId, choferId: catalogo.chofer.id, tipo: "CHOFER", estado: { not: "ANULADA" } },
  });
  if (existente) return existente;

  const viaje = await prisma.viaje.upsert({
    where: { organizacionId_ctg: { organizacionId, ctg } },
    update: {},
    create: {
      organizacionId,
      fecha: new Date(),
      cartaPorte: `0001-${ctg}`,
      ctg,
      cerealId: catalogo.cereal.id,
      clienteId: catalogo.cliente.id,
      transportistaId: catalogo.transportista.id,
      choferId: catalogo.chofer.id,
      camionId: catalogo.vehiculo.id,
      origenId: catalogo.origen.id,
      destinoId: catalogo.destino.id,
      toneladas: 30,
      tarifaTonelada: 8000,
      importeTotal: 240000,
      estado: "DESCARGADO",
      estadoLiquidacion: "LIQUIDADO",
      creadoPorId,
    },
  });

  const comisionPct = catalogo.chofer.comisionPct;
  const subtotal = viaje.importeTotal;
  const comisionMonto = subtotal * (comisionPct / 100);
  const totalViaje = subtotal - comisionMonto;

  const periodoHasta = new Date();
  const periodoDesde = new Date();
  periodoDesde.setDate(periodoDesde.getDate() - 30);

  const liquidacion = await prisma.liquidacion.create({
    data: {
      organizacionId,
      tipo: "CHOFER",
      choferId: catalogo.chofer.id,
      periodoDesde,
      periodoHasta,
      estado: "CONFIRMADA",
      comisionPct,
      totalBruto: totalViaje,
      totalAnticipos: 0,
      totalDescuentos: 0,
      netoPagar: totalViaje,
      creadoPorId,
    },
  });

  await prisma.liquidacionViaje.create({
    data: { organizacionId, liquidacionId: liquidacion.id, viajeId: viaje.id, subtotal, comisionPct, comisionMonto, totalViaje },
  });

  return liquidacion;
}

async function main() {
  console.log("Sembrando entorno mínimo de desarrollo (multiempresa + Grupo Económico)...");

  const passwordHash = await bcrypt.hash("Demo1234!", 10);

  // 1 y 5 — organización principal (reutiliza la que ya crea, en cada base nueva, la migración
  // de backfill 20260712025653_backfill_organizacion_etapa1 — nunca se crea una segunda con el
  // mismo nombre) y una segunda organización de prueba.
  const orgA = await buscarOCrearOrganizacion("Organización Principal", {
    cuit: "30-10000000-1",
    razonSocial: "Organización Principal S.A.",
  });
  const orgB = await buscarOCrearOrganizacion("Organización B - Grupo Económico", {
    cuit: "30-20000000-2",
    razonSocial: "Organización B S.A.",
  });

  // 2, 3 y 4 — ADMINISTRADOR activo de la organización principal, con credenciales conocidas.
  // Usuario.email es la única clave verdaderamente global del schema (@unique real, no
  // compuesta) — upsert por email es correcto acá, a diferencia de cualquier otro modelo.
  const admin = await prisma.usuario.upsert({
    where: { email: "admin@demo.com" },
    update: { organizacionId: orgA.id, rol: "ADMINISTRADOR", activo: true },
    create: {
      organizacionId: orgA.id,
      nombre: "Admin General",
      email: "admin@demo.com",
      passwordHash,
      rol: "ADMINISTRADOR",
      activo: true,
    },
  });

  // 6 — Grupo Económico con ambas organizaciones asociadas.
  const grupo = await buscarOCrearGrupoEconomico("Grupo Económico Demo");
  await prisma.organizacion.update({ where: { id: orgA.id }, data: { grupoEconomicoId: grupo.id } });
  await prisma.organizacion.update({ where: { id: orgB.id }, data: { grupoEconomicoId: grupo.id } });

  // 7 — AccesoGrupoEconomico vigente para el administrador sobre la organización B (su propia
  // organización, la A, ya la opera sin necesitar ningún acceso adicional). otorgadoPorId queda
  // en el propio admin — simplificación deliberada de este fixture: el criterio real de negocio
  // ("solo el Administrador de la organización que otorga el acceso") exigiría un segundo
  // Administrador propio de la organización B, que este seed no crea por no estar pedido en el
  // alcance — no hay ningún Usuario real de la organización B disponible para ese campo.
  await prisma.accesoGrupoEconomico.upsert({
    where: { usuarioId_organizacionId: { usuarioId: admin.id, organizacionId: orgB.id } },
    update: {},
    create: { usuarioId: admin.id, organizacionId: orgB.id, otorgadoPorId: admin.id },
  });

  // 8 y 9 — catálogo mínimo por organización, el mismo chofer real ("Carlos Gómez") en ambas,
  // vinculado a una única IdentidadChoferGrupo — y, sobre cada uno, una Liquidacion CHOFER ya
  // CONFIRMADA, lista para que Bloque 10.5 la encuentre como candidata real.
  const catalogoA = await sembrarCatalogoBase(orgA.id, "A", "10000000", "Carlos Gómez", "20-30111222-3", "30111222");
  const catalogoB = await sembrarCatalogoBase(orgB.id, "B", "20000000", "Carlos Gómez", "20-30111222-3", "30111222");

  const identidad = await buscarOCrearIdentidadChoferGrupo(grupo.id, "Carlos Gómez");
  await prisma.chofer.update({ where: { id: catalogoA.chofer.id }, data: { identidadChoferGrupoId: identidad.id } });
  await prisma.chofer.update({ where: { id: catalogoB.chofer.id }, data: { identidadChoferGrupoId: identidad.id } });

  await sembrarLiquidacionConfirmada(orgA.id, catalogoA, "CTG-DEMO-A001", admin.id);
  // La organización B no tiene ningún Usuario propio en este fixture (ver nota de la sección 7)
  // — creadoPorId queda null, la FK compuesta [creadoPorId, organizacionId] lo exige así.
  await sembrarLiquidacionConfirmada(orgB.id, catalogoB, "CTG-DEMO-B001", null);

  console.log("Entorno mínimo sembrado correctamente.");
  console.log(`  Organización A: ${orgA.nombre} (${orgA.id})`);
  console.log(`  Organización B: ${orgB.nombre} (${orgB.id})`);
  console.log(`  Grupo Económico: ${grupo.nombre} (${grupo.id})`);
  console.log(`  Administrador: ${admin.email} / Demo1234! (organización A, con acceso a B)`);
  console.log(`  IdentidadChoferGrupo: ${identidad.nombreReferencia} (${identidad.id})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

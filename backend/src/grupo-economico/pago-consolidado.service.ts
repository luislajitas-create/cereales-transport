import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { organizacionContextStorage } from "../prisma/organizacion-context";
import { UsuarioGrupoLookupService } from "../prisma/usuario-grupo-lookup.service";
import { CrearPagoConsolidadoDto } from "./dto/crear-pago-consolidado.dto";
import { CancelarPagoConsolidadoDto } from "./dto/cancelar-pago-consolidado.dto";

const PAGO_NO_ENCONTRADO = "Pago consolidado no encontrado.";
const SIN_ACCESO = "No tenés acceso vigente a una de las organizaciones involucradas.";

// Bloque 10.5 — orquesta Pago Consolidado (AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md,
// DISENO_BLOQUE10.5_PAGO_CONSOLIDADO.md, DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md).
// Único servicio de todo el módulo grupo-economico que necesita cruzar organizaciones dentro
// de una misma operación — Liquidacion es organizacional, así que cualquier acceso a ella exige
// abrir explícitamente el contexto de la organización dueña (organizacionContextStorage.run()),
// una por una, nunca una consulta que cruce organizaciones (AUDITORIA_BLOQUE10.5, sección 4).
// PagoConsolidado/PagoConsolidadoLiquidacion no son organizacionales — ORGANIZACION_PRISMA los
// pasa sin filtrar, sin importar qué contexto esté activo en cada momento.
@Injectable()
export class PagoConsolidadoService {
  constructor(
    @Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient,
    private usuarioLookup: UsuarioGrupoLookupService,
  ) {}

  // ---------------------------------------------------------------------------------------
  // Verificaciones compartidas
  // ---------------------------------------------------------------------------------------

  private async verificarGrupo(grupoId: string, actor: any): Promise<void> {
    const grupo = await this.prisma.grupoEconomico.findUnique({ where: { id: grupoId }, select: { id: true } });
    if (!grupo) throw new NotFoundException("Grupo económico no encontrado.");

    const organizacion = await this.prisma.organizacion.findUnique({
      where: { id: actor.organizacionId },
      select: { grupoEconomicoId: true },
    });
    if (organizacion?.grupoEconomicoId !== grupoId) {
      throw new BadRequestException("Tu organización no pertenece a este grupo económico.");
    }
  }

  // DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md, Decisión 4: acceso explícito y vigente a
  // CADA organización involucrada — la mera pertenencia al grupo nunca alcanza. Revalidado en
  // cada llamada (crear, preparar, confirmar, reintentar, cancelar, y también lectura, por
  // consistencia — un pago consolidado ya expone datos financieros de otra organización incluso
  // leído). Mismo criterio exacto que AuthService.cambiarOrganizacion(): organización propia,
  // o AccesoGrupoEconomico vigente con ambas organizaciones todavía en el mismo grupo ahora.
  private async verificarAccesoATodas(grupoId: string, actor: any, organizacionIds: string[]): Promise<void> {
    const unicas = Array.from(new Set(organizacionIds));
    for (const organizacionId of unicas) {
      if (organizacionId === actor.organizacionId) continue;

      const acceso = await this.prisma.accesoGrupoEconomico.findUnique({
        where: { usuarioId_organizacionId: { usuarioId: actor.id, organizacionId } },
      });
      if (!acceso) throw new ForbiddenException(SIN_ACCESO);

      const [organizacionPropia, organizacionDestino] = await Promise.all([
        this.prisma.organizacion.findUnique({ where: { id: actor.organizacionId }, select: { grupoEconomicoId: true } }),
        this.prisma.organizacion.findUnique({ where: { id: organizacionId }, select: { grupoEconomicoId: true } }),
      ]);
      const mismoGrupo =
        organizacionPropia?.grupoEconomicoId != null &&
        organizacionPropia.grupoEconomicoId === organizacionDestino?.grupoEconomicoId &&
        organizacionDestino?.grupoEconomicoId === grupoId;
      if (!mismoGrupo) throw new ForbiddenException(SIN_ACCESO);
    }
  }

  // Revalidación exhaustiva de un ítem — reutilizada por crear() y preparar() (Decisión Técnica
  // 1: la revalidación exhaustiva rige en cada paso del ciclo de vida, no solo en el último).
  // Nunca confía en lo ya verificado en un paso anterior. pagoConsolidadoLiquidacionIdPropio
  // permite que preparar() reintente sin bloquearse a sí mismo si el bloqueo ya lo tiene su
  // propia fila (idempotencia defensiva).
  private async revalidarItem(
    identidadChoferGrupoId: string,
    organizacionId: string,
    liquidacionId: string,
    pagoConsolidadoLiquidacionIdPropio?: string,
  ): Promise<number> {
    let netoPagar = 0;
    await organizacionContextStorage.run({ organizacionId }, async () => {
      const liquidacion = await this.prisma.liquidacion.findUnique({
        where: { id: liquidacionId },
        select: { tipo: true, estado: true, choferId: true, netoPagar: true, pagoConsolidadoLiquidacionId: true },
      });
      if (!liquidacion || liquidacion.tipo !== "CHOFER" || liquidacion.estado !== "CONFIRMADA") {
        throw new BadRequestException("Una de las liquidaciones no existe o no está CONFIRMADA.");
      }
      if (
        liquidacion.pagoConsolidadoLiquidacionId &&
        liquidacion.pagoConsolidadoLiquidacionId !== pagoConsolidadoLiquidacionIdPropio
      ) {
        throw new BadRequestException("Una de las liquidaciones ya está incluida en otro pago consolidado.");
      }
      const chofer = liquidacion.choferId
        ? await this.prisma.chofer.findUnique({ where: { id: liquidacion.choferId }, select: { identidadChoferGrupoId: true } })
        : null;
      if (!chofer || chofer.identidadChoferGrupoId !== identidadChoferGrupoId) {
        throw new BadRequestException("Una de las liquidaciones no corresponde al beneficiario declarado.");
      }
      netoPagar = liquidacion.netoPagar;
    });
    return netoPagar;
  }

  // Reutilizado por preparar()/confirmar()/cancelar()/consultar() — mismo criterio de
  // pertenencia que el resto del archivo: un pago que no pertenece a este grupo se trata igual
  // que uno inexistente (nunca revela si existe en otro grupo).
  private async obtenerPagoOFallar(grupoId: string, pagoId: string) {
    const pago = await this.prisma.pagoConsolidado.findUnique({ where: { id: pagoId }, include: { liquidaciones: true } });
    if (!pago || pago.grupoEconomicoId !== grupoId) throw new NotFoundException(PAGO_NO_ENCONTRADO);
    return pago;
  }

  // Reutilizado por cancelar() (liberación definitiva). Nota: el callback de run() debe ser
  // async y hacer el await ADENTRO (nunca `() => promise` sin await interno) — Prisma difiere el
  // despacho real de la query a un microtask posterior al retorno síncrono de la llamada, y
  // AsyncLocalStorage solo sigue esa continuación de forma fiable cuando el await ocurre dentro
  // de la función encerrada por run(). Mismo patrón que auditarPorOrganizacion() más abajo en
  // este archivo. `cliente` permite invocarlo dentro de un $transaction (cancelar() lo necesita
  // para que la liberación, la transición de estado y la auditoría reviertan juntas ante
  // cualquier fallo — Hallazgo 1, ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md).
  private async liberarBloqueo(
    fila: { organizacionId: string; liquidacionId: string; id: string },
    cliente: any = this.prisma,
  ): Promise<void> {
    await organizacionContextStorage.run({ organizacionId: fila.organizacionId }, async () => {
      await cliente.liquidacion.updateMany({
        where: { id: fila.liquidacionId, pagoConsolidadoLiquidacionId: fila.id },
        data: { pagoConsolidadoLiquidacionId: null },
      });
    });
  }

  // ---------------------------------------------------------------------------------------
  // Candidatos
  // ---------------------------------------------------------------------------------------

  async candidatos(grupoId: string, identidadChoferGrupoId: string, actor: any) {
    await this.verificarGrupo(grupoId, actor);

    const identidad = await this.prisma.identidadChoferGrupo.findUnique({ where: { id: identidadChoferGrupoId } });
    if (!identidad || identidad.grupoEconomicoId !== grupoId) {
      throw new NotFoundException("Identidad de chofer no encontrada en este grupo.");
    }

    const choferes = await this.usuarioLookup.resolverChoferesDeIdentidad(identidadChoferGrupoId);

    // Revalidado en cada consulta: solo organizaciones que siguen en este grupo ahora — nunca
    // asumido desde el vínculo del chofer.
    const organizaciones = await Promise.all(
      choferes.map((c) =>
        this.prisma.organizacion.findUnique({ where: { id: c.organizacionId }, select: { grupoEconomicoId: true } }),
      ),
    );
    const choferesEnGrupo = choferes.filter((_, i) => organizaciones[i]?.grupoEconomicoId === grupoId);

    await this.verificarAccesoATodas(
      grupoId,
      actor,
      choferesEnGrupo.map((c) => c.organizacionId),
    );

    const resultados: { id: string; organizacionId: string; numero: number; periodoDesde: Date; periodoHasta: Date; netoPagar: number }[] = [];
    for (const chofer of choferesEnGrupo) {
      await organizacionContextStorage.run({ organizacionId: chofer.organizacionId }, async () => {
        const liquidaciones = await this.prisma.liquidacion.findMany({
          where: { choferId: chofer.choferId, tipo: "CHOFER", estado: "CONFIRMADA", pagoConsolidadoLiquidacionId: null },
          select: { id: true, numero: true, periodoDesde: true, periodoHasta: true, netoPagar: true },
          orderBy: { periodoDesde: "asc" },
        });
        for (const l of liquidaciones) resultados.push({ ...l, organizacionId: chofer.organizacionId });
      });
    }
    return resultados;
  }

  // ---------------------------------------------------------------------------------------
  // Crear (BORRADOR)
  // ---------------------------------------------------------------------------------------

  async crear(grupoId: string, dto: CrearPagoConsolidadoDto, actor: any) {
    await this.verificarGrupo(grupoId, actor);

    const identidad = await this.prisma.identidadChoferGrupo.findUnique({ where: { id: dto.identidadChoferGrupoId } });
    if (!identidad || identidad.grupoEconomicoId !== grupoId) {
      throw new NotFoundException("Identidad de chofer no encontrada en este grupo.");
    }

    const claves = dto.items.map((i) => `${i.organizacionId}:${i.liquidacionId}`);
    if (new Set(claves).size !== claves.length) {
      throw new BadRequestException("La lista de liquidaciones contiene ítems duplicados.");
    }

    const organizacionIds = dto.items.map((i) => i.organizacionId);
    await this.verificarAccesoATodas(grupoId, actor, organizacionIds);

    const organizaciones = await Promise.all(
      Array.from(new Set(organizacionIds)).map((id) =>
        this.prisma.organizacion.findUnique({ where: { id }, select: { grupoEconomicoId: true } }).then((o) => [id, o] as const),
      ),
    );
    for (const [id, org] of organizaciones) {
      if (org?.grupoEconomicoId !== grupoId) {
        throw new BadRequestException(`La organización ${id} no pertenece a este grupo económico.`);
      }
    }

    const detalles: { organizacionId: string; liquidacionId: string; netoPagar: number }[] = [];
    for (const item of dto.items) {
      const netoPagar = await this.revalidarItem(dto.identidadChoferGrupoId, item.organizacionId, item.liquidacionId);
      detalles.push({ organizacionId: item.organizacionId, liquidacionId: item.liquidacionId, netoPagar });
    }

    const totalConsolidado = detalles.reduce((acc, d) => acc + d.netoPagar, 0);

    // Creación + auditoría en la misma transacción: si la auditoría de alguna organización
    // fallara, el PagoConsolidado no debe quedar huérfano en BORRADOR (hallazgo de validación,
    // 2026-07-18 — antes de esta corrección un fallo posterior a la creación dejaba el registro
    // comprometido pese a que el cliente recibía un error).
    const pago = await this.prisma.$transaction(async (tx) => {
      const creado = await tx.pagoConsolidado.create({
        data: {
          grupoEconomicoId: grupoId,
          identidadChoferGrupoId: dto.identidadChoferGrupoId,
          estado: "BORRADOR",
          totalConsolidado,
          referenciaPago: dto.referenciaPago,
          creadoPorId: actor.id,
          liquidaciones: {
            create: detalles.map((d) => ({
              organizacionId: d.organizacionId,
              liquidacionId: d.liquidacionId,
              subtotalNetoPagar: d.netoPagar,
              estadoAplicacion: "PENDIENTE",
            })),
          },
        },
        include: { liquidaciones: true },
      });

      await this.auditarPorOrganizacion(
        organizacionIds,
        actor,
        creado.id,
        "pago_consolidado_creado",
        { identidadChoferGrupoId: dto.identidadChoferGrupoId, totalConsolidado },
        tx,
      );

      return creado;
    });

    return pago;
  }

  // ---------------------------------------------------------------------------------------
  // Preparar (BORRADOR -> PREPARADO) — adquiere el bloqueo dentro de una transacción única
  // ---------------------------------------------------------------------------------------

  async preparar(grupoId: string, pagoId: string, actor: any) {
    await this.verificarGrupo(grupoId, actor);

    const pago = await this.obtenerPagoOFallar(grupoId, pagoId);
    if (pago.estado !== "BORRADOR") {
      throw new BadRequestException("Solo se puede preparar un pago consolidado en estado BORRADOR.");
    }

    const organizacionIds = pago.liquidaciones.map((l) => l.organizacionId);
    await this.verificarAccesoATodas(grupoId, actor, organizacionIds);

    for (const fila of pago.liquidaciones) {
      await this.revalidarItem(pago.identidadChoferGrupoId, fila.organizacionId, fila.liquidacionId, fila.id);
    }

    // Adquisición del bloqueo + transición a PREPARADO + auditoría en una única transacción
    // física: si cualquier paso falla (incluida la auditoría de cualquier organización),
    // Postgres revierte todo lo escrito en este intento — el pago nunca queda ni con un bloqueo
    // parcial ni en PREPARADO con auditoría incompleta (Hallazgo 1,
    // AUDITORIA_ADVERSARIAL_BLOQUE10.5.md / ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md). La revocación
    // nativa de la transacción reemplaza a la compensación manual que existía antes acá —
    // mantenerla habría quedado muerta (y potencialmente incorrecta, al operar con un cliente
    // fuera de la transacción) una vez que todo el bloque ya revierte solo.
    const actualizado = await this.prisma.$transaction(async (tx) => {
      for (const fila of pago.liquidaciones) {
        await organizacionContextStorage.run({ organizacionId: fila.organizacionId }, async () => {
          const { count } = await tx.liquidacion.updateMany({
            where: { id: fila.liquidacionId, pagoConsolidadoLiquidacionId: null },
            data: { pagoConsolidadoLiquidacionId: fila.id },
          });
          if (count === 0) {
            throw new BadRequestException("Una de las liquidaciones ya fue bloqueada por otra operación en curso.");
          }
        });
      }

      const pagoActualizado = await tx.pagoConsolidado.update({
        where: { id: pagoId },
        data: { estado: "PREPARADO" },
        include: { liquidaciones: true },
      });

      await this.auditarPorOrganizacion(organizacionIds, actor, pagoId, "pago_consolidado_preparado", undefined, tx);

      return pagoActualizado;
    });

    return actualizado;
  }

  // ---------------------------------------------------------------------------------------
  // Confirmar (PREPARADO/PARCIAL/FALLIDO -> PROCESANDO -> CONFIRMADO/PARCIAL/FALLIDO)
  // El mismo método sirve como reintento: solo procesa filas PENDIENTE/FALLIDA.
  // ---------------------------------------------------------------------------------------

  async confirmar(grupoId: string, pagoId: string, actor: any) {
    await this.verificarGrupo(grupoId, actor);

    const pago = await this.obtenerPagoOFallar(grupoId, pagoId);
    if (!["PREPARADO", "PARCIAL", "FALLIDO"].includes(pago.estado)) {
      throw new BadRequestException("Solo se puede confirmar un pago PREPARADO, PARCIAL o FALLIDO.");
    }

    const organizacionIds = pago.liquidaciones.map((l) => l.organizacionId);
    await this.verificarAccesoATodas(grupoId, actor, organizacionIds);

    // Transición atómica a PROCESANDO — impide una segunda ejecución concurrente del mismo pago
    // (DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md, Decisión 5, tabla de transiciones).
    const { count } = await this.prisma.pagoConsolidado.updateMany({
      where: { id: pagoId, estado: { in: ["PREPARADO", "PARCIAL", "FALLIDO"] } },
      data: { estado: "PROCESANDO" },
    });
    if (count === 0) {
      throw new BadRequestException("El pago ya está siendo procesado por otra operación.");
    }

    // Solo las filas todavía no aplicadas, en orden determinístico (Decisión Técnica 1).
    const pendientes = pago.liquidaciones
      .filter((l) => l.estadoAplicacion !== "APLICADA")
      .sort((a, b) => a.organizacionId.localeCompare(b.organizacionId));

    for (const fila of pendientes) {
      try {
        await organizacionContextStorage.run({ organizacionId: fila.organizacionId }, async () => {
          await this.prisma.$transaction(async (tx) => {
            const liquidacion = await tx.liquidacion.findUnique({ where: { id: fila.liquidacionId }, include: { viajes: true } });
            if (!liquidacion || liquidacion.estado !== "CONFIRMADA") {
              throw new Error("La liquidación ya no está en condiciones de pagarse.");
            }
            await tx.liquidacion.update({ where: { id: fila.liquidacionId }, data: { estado: "PAGADA", fechaPago: new Date() } });
            for (const lv of liquidacion.viajes) {
              await tx.viaje.update({ where: { id: lv.viajeId }, data: { estadoLiquidacion: "PAGADO" } });
            }
            const auditoria = this.datosAuditoria(fila.organizacionId, actor, { liquidacionId: fila.liquidacionId });
            await tx.auditLog.create({
              data: {
                usuarioId: auditoria.usuarioId,
                entidad: "PagoConsolidado",
                entidadId: pagoId,
                accion: "pago_consolidado_aplicado",
                datosNuevos: auditoria.datos,
              },
            });
            // Hallazgo 2 (ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md): este update debe ocurrir DENTRO
            // de la misma transacción que el pago real — de lo contrario una caída entre ambas
            // escrituras deja la liquidación PAGADA con su fila de seguimiento todavía PENDIENTE.
            await tx.pagoConsolidadoLiquidacion.update({ where: { id: fila.id }, data: { estadoAplicacion: "APLICADA" } });
          });
        });
      } catch {
        await this.prisma.pagoConsolidadoLiquidacion.update({ where: { id: fila.id }, data: { estadoAplicacion: "FALLIDA" } });
        // Auditoría del fallo: best-effort, nunca bloquea la secuencia (mismo criterio que
        // AuthService.registrarIntentoDenegado()).
        const auditoriaFallo = this.datosAuditoria(fila.organizacionId, actor, { liquidacionId: fila.liquidacionId });
        await organizacionContextStorage
          .run({ organizacionId: fila.organizacionId }, async () => {
            await this.prisma.auditLog.create({
              data: {
                usuarioId: auditoriaFallo.usuarioId,
                entidad: "PagoConsolidado",
                entidadId: pagoId,
                accion: "pago_consolidado_aplicacion_fallida",
                datosAnteriores: auditoriaFallo.datos,
              },
            });
          })
          .catch(() => {});
      }
    }

    const filasFinal = await this.prisma.pagoConsolidadoLiquidacion.findMany({ where: { pagoConsolidadoId: pagoId } });
    const aplicadas = filasFinal.filter((f) => f.estadoAplicacion === "APLICADA").length;
    const estadoFinal = aplicadas === filasFinal.length ? "CONFIRMADO" : aplicadas === 0 ? "FALLIDO" : "PARCIAL";

    return this.prisma.pagoConsolidado.update({
      where: { id: pagoId },
      data: { estado: estadoFinal },
      include: { liquidaciones: true },
    });
  }

  // ---------------------------------------------------------------------------------------
  // Cancelar — solo BORRADOR, PREPARADO o FALLIDO (nunca con alguna liquidación ya pagada)
  // ---------------------------------------------------------------------------------------

  async cancelar(grupoId: string, pagoId: string, dto: CancelarPagoConsolidadoDto, actor: any) {
    await this.verificarGrupo(grupoId, actor);

    const pago = await this.obtenerPagoOFallar(grupoId, pagoId);
    if (!["BORRADOR", "PREPARADO", "FALLIDO"].includes(pago.estado)) {
      throw new BadRequestException(
        "No se puede cancelar un pago consolidado con al menos una liquidación ya pagada (DECISIONES_TECNICAS_BLOQUE10.5_PAGO_CONSOLIDADO.md, Decisión 5).",
      );
    }

    const organizacionIds = pago.liquidaciones.map((l) => l.organizacionId);
    await this.verificarAccesoATodas(grupoId, actor, organizacionIds);

    // Liberación de bloqueo + transición a CANCELADO + auditoría en una única transacción
    // física — mismo criterio y mismo motivo que preparar() (Hallazgo 1,
    // AUDITORIA_ADVERSARIAL_BLOQUE10.5.md / ANALISIS_DE_HALLAZGOS_BLOQUE10.5.md).
    const actualizado = await this.prisma.$transaction(async (tx) => {
      for (const fila of pago.liquidaciones) {
        await this.liberarBloqueo(fila, tx);
      }

      const pagoActualizado = await tx.pagoConsolidado.update({
        where: { id: pagoId },
        data: { estado: "CANCELADO", canceladoPorId: actor.id, canceladoMotivo: dto.motivo },
      });

      await this.auditarPorOrganizacion(organizacionIds, actor, pagoId, "pago_consolidado_cancelado", { motivo: dto.motivo }, tx);

      return pagoActualizado;
    });

    return actualizado;
  }

  // ---------------------------------------------------------------------------------------
  // Consulta
  // ---------------------------------------------------------------------------------------

  async listar(grupoId: string, actor: any) {
    await this.verificarGrupo(grupoId, actor);
    const pagos = await this.prisma.pagoConsolidado.findMany({
      where: { grupoEconomicoId: grupoId },
      include: { liquidaciones: true },
      orderBy: { createdAt: "desc" },
    });
    const organizacionIds = pagos.flatMap((p) => p.liquidaciones.map((l) => l.organizacionId));
    await this.verificarAccesoATodas(grupoId, actor, organizacionIds);
    return pagos;
  }

  async consultar(grupoId: string, pagoId: string, actor: any) {
    await this.verificarGrupo(grupoId, actor);
    const pago = await this.obtenerPagoOFallar(grupoId, pagoId);
    await this.verificarAccesoATodas(
      grupoId,
      actor,
      pago.liquidaciones.map((l) => l.organizacionId),
    );
    return pago;
  }

  // ---------------------------------------------------------------------------------------

  // AuditLog.usuario tiene una FK compuesta [usuarioId, organizacionId] -> Usuario[id,
  // organizacionId] (backend/prisma/schema.prisma) — exige que usuarioId pertenezca, como
  // Usuario nativo, a esa misma organización. Un administrador de Grupo Económico solo es
  // Usuario nativo de UNA organización; en cualquier otra donde tiene acceso vía
  // AccesoGrupoEconomico, esa FK se viola si se intenta escribir usuarioId: actor.id. Resuelto
  // (decisión del Product Owner, 2026-07-18): en la organización propia del actor se audita con
  // usuarioId real; en cualquier otra organización involucrada se audita con usuarioId: null
  // (el campo ya es nullable) y se preserva la identidad real del actor dentro del JSON
  // (datosNuevos/datosAnteriores.actorId) — sin migración, sin relajar la FK compartida por
  // todo el sistema.
  private datosAuditoria(
    organizacionId: string,
    actor: any,
    datos?: Record<string, unknown>,
  ): { usuarioId: string | null; datos: Record<string, unknown> | undefined } {
    const esOrganizacionPropia = organizacionId === actor.organizacionId;
    return {
      usuarioId: esOrganizacionPropia ? actor.id : null,
      datos: esOrganizacionPropia ? datos : { ...(datos ?? {}), actorId: actor.id },
    };
  }

  // AuditLog es organizacional — cada entrada se escribe dentro del contexto explícito de la
  // organización correspondiente, una por organización involucrada, nunca una entrada de
  // "grupo" sin organización (AUDITORIA_BLOQUE10.5_PAGO_CONSOLIDADO.md, sección 7). `cliente`
  // permite reutilizar este helper dentro de un $transaction (crear() lo necesita para no dejar
  // un PagoConsolidado huérfano si la auditoría fallara) — por defecto usa el cliente scopeado
  // de nivel superior.
  private async auditarPorOrganizacion(
    organizacionIds: string[],
    actor: any,
    pagoId: string,
    accion: string,
    datosNuevos?: Record<string, unknown>,
    cliente: any = this.prisma,
  ): Promise<void> {
    for (const organizacionId of new Set(organizacionIds)) {
      const { usuarioId, datos } = this.datosAuditoria(organizacionId, actor, datosNuevos);
      await organizacionContextStorage.run({ organizacionId }, async () => {
        await cliente.auditLog.create({
          data: { usuarioId, entidad: "PagoConsolidado", entidadId: pagoId, accion, datosNuevos: datos },
        });
      });
    }
  }
}

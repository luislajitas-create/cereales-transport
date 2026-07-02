import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import {
  EstadoSolicitudCombustible,
  EstadoCuentaCorriente,
  TipoMovimientoCuenta,
} from "@prisma/client";

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("combustibles")
export class CombustiblesController {
  constructor(private prisma: PrismaService) {}

  // ============================================================
  // SOLICITUD ENDPOINTS
  // ============================================================

  /** Create new fuel request (BORRADOR) */
  @Post("solicitudes")
  @Roles("OPERACIONES", "ADMINISTRADOR")
  async createSolicitud(
    @Body()
    data: {
      choferId: string;
      transportistaId: string;
      estacionId: string;
      cantidadSolicitada: number;
      precioEstimado: number;
      fecha: string;
      observaciones?: string;
    },
    @CurrentUser() user: any,
  ) {
    // Validations
    if (data.cantidadSolicitada <= 0) {
      throw new BadRequestException("cantidadSolicitada must be > 0");
    }

    const chofer = await this.prisma.chofer.findUnique({
      where: { id: data.choferId },
    });
    if (!chofer) throw new NotFoundException("Chofer not found");

    const transportista = await this.prisma.transportista.findUnique({
      where: { id: data.transportistaId },
    });
    if (!transportista) throw new NotFoundException("Transportista not found");

    const estacion = await this.prisma.estacionServicio.findUnique({
      where: { id: data.estacionId },
    });
    if (!estacion || !estacion.activa) {
      throw new NotFoundException("Estación Servicio not found or inactive");
    }

    const solicitud = await this.prisma.solicitudCombustible.create({
      data: {
        choferId: data.choferId,
        transportistaId: data.transportistaId,
        estacionId: data.estacionId,
        cantidadSolicitada: data.cantidadSolicitada,
        precioEstimado: data.precioEstimado,
        fecha: new Date(data.fecha),
        observaciones: data.observaciones,
        estado: EstadoSolicitudCombustible.BORRADOR,
      },
      include: this.solicitudInclude(),
    });

    // Audit log
    await this.logAudit(user.id, "SolicitudCombustible", solicitud.id, "CREATE", null, solicitud);

    return solicitud;
  }

  /** List solicitudes with filters */
  @Get("solicitudes")
  @Roles("OPERACIONES", "GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async listSolicitudes(
    @Query("choferId") choferId?: string,
    @Query("transportistaId") transportistaId?: string,
    @Query("estacionId") estacionId?: string,
    @Query("estado") estado?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
    @Query("skip") skip: string = "0",
    @Query("take") take: string = "50",
  ) {
    const where: any = {};

    if (choferId) where.choferId = choferId;
    if (transportistaId) where.transportistaId = transportistaId;
    if (estacionId) where.estacionId = estacionId;
    if (estado) where.estado = estado;

    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    const [solicitudes, total] = await Promise.all([
      this.prisma.solicitudCombustible.findMany({
        where,
        include: this.solicitudInclude(),
        orderBy: { fecha: "desc" },
        skip: parseInt(skip),
        take: parseInt(take),
      }),
      this.prisma.solicitudCombustible.count({ where }),
    ]);

    return { solicitudes, total };
  }

  /** Get single solicitud */
  @Get("solicitudes/:id")
  @Roles("OPERACIONES", "GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async getSolicitud(@Param("id") id: string) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
      include: this.solicitudInclude(),
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    return solicitud;
  }

  /** Driver: Submit request (BORRADOR → SOLICITADO) */
  @Patch("solicitudes/:id/enviar")
  @Roles("OPERACIONES", "ADMINISTRADOR")
  async submitSolicitud(@Param("id") id: string, @CurrentUser() user: any) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    if (solicitud.estado !== EstadoSolicitudCombustible.BORRADOR) {
      throw new BadRequestException(
        "Only BORRADOR solicitudes can be submitted"
      );
    }

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: { estado: EstadoSolicitudCombustible.SOLICITADO },
      include: this.solicitudInclude(),
    });

    await this.logAudit(user.id, "SolicitudCombustible", id, "ENVIAR", solicitud, updated);
    return updated;
  }

  /** Manager: Authorize request (SOLICITADO → AUTORIZADO) */
  @Patch("solicitudes/:id/autorizar")
  @Roles("GERENCIA", "ADMINISTRADOR")
  async authorizeSolicitud(
    @Param("id") id: string,
    @Body() data: { observaciones?: string },
    @CurrentUser() user: any,
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    if (solicitud.estado !== EstadoSolicitudCombustible.SOLICITADO) {
      throw new BadRequestException(
        "Only SOLICITADO solicitudes can be authorized"
      );
    }

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: {
        estado: EstadoSolicitudCombustible.AUTORIZADO,
        autorizadoPorId: user.id,
        fechaAutorizacion: new Date(),
        observaciones: data.observaciones || solicitud.observaciones,
      },
      include: this.solicitudInclude(),
    });

    await this.logAudit(user.id, "SolicitudCombustible", id, "AUTORIZAR", solicitud, updated);
    return updated;
  }

  /** Manager: Reject request (SOLICITADO → RECHAZADO) */
  @Patch("solicitudes/:id/rechazar")
  @Roles("GERENCIA", "ADMINISTRADOR")
  async rejectSolicitud(
    @Param("id") id: string,
    @Body() data: { motivo: string },
    @CurrentUser() user: any,
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    if (solicitud.estado !== EstadoSolicitudCombustible.SOLICITADO) {
      throw new BadRequestException(
        "Only SOLICITADO solicitudes can be rejected"
      );
    }

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: {
        estado: EstadoSolicitudCombustible.RECHAZADO,
        observaciones: data.motivo,
      },
      include: this.solicitudInclude(),
    });

    await this.logAudit(user.id, "SolicitudCombustible", id, "RECHAZAR", solicitud, updated);
    return updated;
  }

  /** Manager: Modify and authorize (SOLICITADO → MODIFICADO/AUTORIZADO) */
  @Patch("solicitudes/:id/modificar")
  @Roles("GERENCIA", "ADMINISTRADOR")
  async modifySolicitud(
    @Param("id") id: string,
    @Body()
    data: {
      cantidadSolicitada?: number;
      estacionId?: string;
      precioEstimado?: number;
      fecha?: string;
      observaciones?: string;
    },
    @CurrentUser() user: any,
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    if (solicitud.estado !== EstadoSolicitudCombustible.SOLICITADO) {
      throw new BadRequestException(
        "Only SOLICITADO solicitudes can be modified"
      );
    }

    if (data.cantidadSolicitada && data.cantidadSolicitada <= 0) {
      throw new BadRequestException("cantidadSolicitada must be > 0");
    }

    const updateData: any = {
      estado: EstadoSolicitudCombustible.MODIFICADO,
      autorizadoPorId: user.id,
      fechaAutorizacion: new Date(),
    };

    if (data.cantidadSolicitada)
      updateData.cantidadSolicitada = data.cantidadSolicitada;
    if (data.estacionId) updateData.estacionId = data.estacionId;
    if (data.precioEstimado) updateData.precioEstimado = data.precioEstimado;
    if (data.fecha) updateData.fecha = new Date(data.fecha);
    if (data.observaciones) updateData.observaciones = data.observaciones;

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: updateData,
      include: this.solicitudInclude(),
    });

    await this.logAudit(user.id, "SolicitudCombustible", id, "MODIFICAR", solicitud, updated);
    return updated;
  }

  // ============================================================
  // DISPATCH ENDPOINTS
  // ============================================================

  /** Dispatch solicitud to gas station (AUTORIZADO → ENVIADO) */
  @Post("solicitudes/:id/despachar")
  @Roles("OPERACIONES", "ADMINISTRADOR")
  async dispatchSolicitud(
    @Param("id") id: string,
    @Body() data: { numeroDespacho?: string },
    @CurrentUser() user: any,
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");

    const validStates = [
      EstadoSolicitudCombustible.AUTORIZADO,
      EstadoSolicitudCombustible.MODIFICADO,
    ];
    if (!validStates.includes(solicitud.estado)) {
      throw new BadRequestException(
        "Only AUTORIZADO/MODIFICADO solicitudes can be dispatched"
      );
    }

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: {
        estado: EstadoSolicitudCombustible.ENVIADO,
        enviadoEl: new Date(),
        numeroDespacho: data.numeroDespacho || null,
      },
      include: this.solicitudInclude(),
    });

    await this.logAudit(user.id, "SolicitudCombustible", id, "DESPACHAR", solicitud, updated);
    return updated;
  }

  // ============================================================
  // RECEPTION ENDPOINTS
  // ============================================================

  /** Gas station: Confirm receipt and actual amount (ENVIADO → RECIBIDO) */
  @Patch("solicitudes/:id/recibir")
  @Roles("OPERACIONES", "ADMINISTRADOR")
  async receiveFuel(
    @Param("id") id: string,
    @Body()
    data: {
      cantidadRecibida: number;
      precioFinal: number;
      comprobante?: string;
      motivoDiscrepancia?: string;
    },
    @CurrentUser() user: any,
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id },
    });

    if (!solicitud) throw new NotFoundException("Solicitud not found");
    if (solicitud.estado !== EstadoSolicitudCombustible.ENVIADO) {
      throw new BadRequestException(
        "Only ENVIADO solicitudes can be marked as received"
      );
    }

    // Calculate discrepancy (tolerance: 2%)
    const discrepancyPct =
      Math.abs(data.cantidadRecibida - solicitud.cantidadSolicitada) /
      solicitud.cantidadSolicitada;
    const discrepancia = discrepancyPct > 0.02;

    const updated = await this.prisma.solicitudCombustible.update({
      where: { id },
      data: {
        estado: EstadoSolicitudCombustible.RECIBIDO,
        cantidadRecibida: data.cantidadRecibida,
        precioFinal: data.precioFinal,
        comprobante: data.comprobante || null,
        recibidoEl: new Date(),
        discrepancia,
        motivoDiscrepancia: discrepancia ? data.motivoDiscrepancia || null : null,
      },
      include: this.solicitudInclude(),
    });

    // Auto-reconcile if no discrepancy
    if (!discrepancia) {
      await this.reconcileSolicitud(id, user.id, "AUTO_RECONCILIACION");
    }

    await this.logAudit(user.id, "SolicitudCombustible", id, "RECIBIR", solicitud, updated);
    return updated;
  }

  // ============================================================
  // RECONCILIATION ENDPOINTS
  // ============================================================

  /** Manual reconciliation trigger */
  @Post("reconciliaciones")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR")
  async createReconciliation(
    @Body()
    data: {
      estacionId: string;
      fecha?: string;
      observaciones?: string;
    },
    @CurrentUser() user: any,
  ) {
    const estacion = await this.prisma.estacionServicio.findUnique({
      where: { id: data.estacionId },
    });
    if (!estacion) throw new NotFoundException("Estación not found");

    // Find all RECIBIDO solicitudes for this station
    const solicitudes = await this.prisma.solicitudCombustible.findMany({
      where: {
        estacionId: data.estacionId,
        estado: EstadoSolicitudCombustible.RECIBIDO,
        discrepancia: false,
      },
    });

    const matches = solicitudes.length;
    const discrepancies = await this.prisma.solicitudCombustible.count({
      where: {
        estacionId: data.estacionId,
        estado: EstadoSolicitudCombustible.RECIBIDO,
        discrepancia: true,
      },
    });

    const montoSolicitado = solicitudes.reduce(
      (sum, s) => sum + (s.precioEstimado || 0),
      0
    );
    const montoRecibido = solicitudes.reduce(
      (sum, s) => sum + (s.precioFinal || 0),
      0
    );

    const reconciliation = await this.prisma.reconciliacionCombustible.create({
      data: {
        estacionId: data.estacionId,
        fecha: data.fecha ? new Date(data.fecha) : new Date(),
        fuente: "MANUAL",
        solicitudesMatches: matches,
        solicitudesDiscrepancias: discrepancies,
        montoTotalSolicitado: montoSolicitado,
        montoTotalRecibido: montoRecibido,
        diferencia: montoRecibido - montoSolicitado,
        observaciones: data.observaciones,
      },
    });

    // Auto-liquidate matching solicitudes
    for (const solicitud of solicitudes) {
      await this.liquidateSolicitud(solicitud.id, user.id);
    }

    await this.logAudit(user.id, "ReconciliacionCombustible", reconciliation.id, "CREATE", null, reconciliation);

    return reconciliation;
  }

  /** Get reconciliations */
  @Get("reconciliaciones")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async listReconciliaciones(
    @Query("estacionId") estacionId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const where: any = {};
    if (estacionId) where.estacionId = estacionId;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    return this.prisma.reconciliacionCombustible.findMany({
      where,
      include: { estacion: true, importFiles: true },
      orderBy: { fecha: "desc" },
    });
  }

  // ============================================================
  // STATION ACCOUNT (CUENTA CORRIENTE)
  // ============================================================

  /** Get station account */
  @Get("estaciones/:id/cuenta-corriente")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async getStationAccount(@Param("id") id: string) {
    const cuenta = await this.prisma.cuentaCorrienteEstacion.findUnique({
      where: { estacionId: id },
      include: {
        estacion: true,
        movimientos: { orderBy: { fecha: "desc" }, take: 100 },
      },
    });

    if (!cuenta) throw new NotFoundException("Cuenta corriente not found");
    return cuenta;
  }

  /** Get account movements */
  @Get("estaciones/:id/movimientos")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async getAccountMovements(
    @Param("id") id: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const where: any = { cuentaCorriente: { estacionId: id } };
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    return this.prisma.movimientoCuentaCorriente.findMany({
      where,
      orderBy: { fecha: "desc" },
    });
  }

  // ============================================================
  // PAYMENT ENDPOINTS
  // ============================================================

  /** Record payment to gas station */
  @Post("pagos")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR")
  async recordPayment(
    @Body()
    data: {
      estacionId: string;
      importePago: number;
      metodoPago: string;
      numeroComprobante?: string;
      descripcion?: string;
    },
    @CurrentUser() user: any,
  ) {
    const estacion = await this.prisma.estacionServicio.findUnique({
      where: { id: data.estacionId },
    });
    if (!estacion) throw new NotFoundException("Estación not found");

    // Get or create account
    let cuenta = await this.prisma.cuentaCorrienteEstacion.findUnique({
      where: { estacionId: data.estacionId },
    });

    if (!cuenta) {
      cuenta = await this.prisma.cuentaCorrienteEstacion.create({
        data: {
          estacionId: data.estacionId,
          saldo: 0,
          estado: EstadoCuentaCorriente.ACTIVA,
        },
      });
    }

    // Verify payment doesn't exceed balance
    if (data.importePago > cuenta.saldo) {
      throw new BadRequestException(
        `Payment exceeds account balance (balance: ${cuenta.saldo})`
      );
    }

    // Create payment
    const pago = await this.prisma.pagoEstacion.create({
      data: {
        estacionId: data.estacionId,
        cuentaCorrienteId: cuenta.id,
        fecha: new Date(),
        importePago: data.importePago,
        metodoPago: data.metodoPago as any,
        numeroComprobante: data.numeroComprobante,
        descripcion: data.descripcion,
      },
      include: { estacion: true, cuentaCorriente: true },
    });

    // Update account balance and create movement
    await this.prisma.cuentaCorrienteEstacion.update({
      where: { id: cuenta.id },
      data: { saldo: cuenta.saldo - data.importePago },
    });

    await this.prisma.movimientoCuentaCorriente.create({
      data: {
        cuentaCorrienteId: cuenta.id,
        tipoMovimiento: TipoMovimientoCuenta.PAGO,
        fecha: new Date(),
        monto: -data.importePago,
        referencia: pago.id,
        observacion: `Pago: ${data.descripcion}`,
      },
    });

    await this.logAudit(user.id, "PagoEstacion", pago.id, "CREATE", null, pago);

    return pago;
  }

  /** List payments */
  @Get("pagos")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async listPayments(
    @Query("estacionId") estacionId?: string,
    @Query("desde") desde?: string,
    @Query("hasta") hasta?: string,
  ) {
    const where: any = {};
    if (estacionId) where.estacionId = estacionId;
    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    return this.prisma.pagoEstacion.findMany({
      where,
      include: { estacion: true },
      orderBy: { fecha: "desc" },
    });
  }

  // ============================================================
  // REPORTS ENDPOINTS
  // ============================================================

  /** Fuel consumption by driver */
  @Get("reportes/por-chofer")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async reportByDriver(@Query("periodo") periodo?: string) {
    const where: any = {};
    if (periodo) where.periodo = periodo;

    return this.prisma.consumoCombustibleEstadistica.findMany({
      where,
      orderBy: { periodo: "desc" },
    });
  }

  /** Fuel consumption by station */
  @Get("reportes/por-estacion")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async reportByStation(@Query("desde") desde?: string, @Query("hasta") hasta?: string) {
    const where: any = {
      estado: EstadoSolicitudCombustible.LIQUIDADO,
    };

    if (desde || hasta) {
      where.fecha = {};
      if (desde) where.fecha.gte = new Date(desde);
      if (hasta) where.fecha.lte = new Date(hasta);
    }

    const solicitudes = await this.prisma.solicitudCombustible.findMany({
      where,
      include: { estacion: true },
    });

    const grouped = solicitudes.reduce((acc, s) => {
      const stationId = s.estacionId;
      if (!acc[stationId]) {
        acc[stationId] = {
          estacion: s.estacion,
          cantidadLitros: 0,
          costoTotal: 0,
          transacciones: 0,
        };
      }
      acc[stationId].cantidadLitros += s.cantidadRecibida || 0;
      acc[stationId].costoTotal += s.precioFinal || 0;
      acc[stationId].transacciones += 1;
      return acc;
    }, {});

    return Object.values(grouped);
  }

  /** List discrepancies */
  @Get("reportes/discrepancias")
  @Roles("GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async reportDiscrepancies() {
    return this.prisma.solicitudCombustible.findMany({
      where: { discrepancia: true },
      include: {
        chofer: true,
        estacion: true,
        transportista: true,
      },
      orderBy: { recibidoEl: "desc" },
    });
  }

  // ============================================================
  // GAS STATION MANAGEMENT
  // ============================================================

  /** Create gas station */
  @Post("estaciones")
  @Roles("GERENCIA", "ADMINISTRADOR")
  async createStation(
    @Body()
    data: {
      nombre: string;
      localidad: string;
      direccion?: string;
      telefono?: string;
      contacto?: string;
      email?: string;
      coordenadas?: string;
    },
  ) {
    const station = await this.prisma.estacionServicio.create({
      data,
    });

    // Create account
    await this.prisma.cuentaCorrienteEstacion.create({
      data: {
        estacionId: station.id,
        saldo: 0,
        estado: EstadoCuentaCorriente.ACTIVA,
      },
    });

    return station;
  }

  /** List stations */
  @Get("estaciones")
  @Roles("OPERACIONES", "GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async listStations(
    @Query("localidad") localidad?: string,
    @Query("activa") activa: string = "true",
  ) {
    const where: any = {};
    if (localidad) where.localidad = localidad;
    where.activa = activa === "true";

    return this.prisma.estacionServicio.findMany({
      where,
      include: { cuentaCorriente: true },
    });
  }

  /** Get station details */
  @Get("estaciones/:id")
  @Roles("OPERACIONES", "GERENCIA", "LIQUIDACIONES", "ADMINISTRADOR", "LECTURA")
  async getStation(@Param("id") id: string) {
    const station = await this.prisma.estacionServicio.findUnique({
      where: { id },
      include: { cuentaCorriente: true },
    });

    if (!station) throw new NotFoundException("Estación not found");
    return station;
  }

  // ============================================================
  // HELPER METHODS
  // ============================================================

  private solicitudInclude() {
    return {
      chofer: { select: { id: true, nombre: true, cuil: true } },
      transportista: { select: { id: true, razonSocial: true } },
      estacion: { select: { id: true, nombre: true, localidad: true } },
      autorizadoPor: { select: { id: true, nombre: true } },
      liquidacion: true,
    };
  }

  private async reconcileSolicitud(
    solicitudId: string,
    userId: string,
    fuente: string
  ) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id: solicitudId },
    });

    if (solicitud) {
      await this.liquidateSolicitud(solicitudId, userId);
    }
  }

  private async liquidateSolicitud(solicitudId: string, userId: string) {
    const solicitud = await this.prisma.solicitudCombustible.findUnique({
      where: { id: solicitudId },
    });

    if (!solicitud || solicitud.estado !== EstadoSolicitudCombustible.RECIBIDO) {
      return;
    }

    // Create or update account
    let cuenta = await this.prisma.cuentaCorrienteEstacion.findUnique({
      where: { estacionId: solicitud.estacionId },
    });

    if (!cuenta) {
      cuenta = await this.prisma.cuentaCorrienteEstacion.create({
        data: {
          estacionId: solicitud.estacionId,
          saldo: 0,
          estado: EstadoCuentaCorriente.ACTIVA,
        },
      });
    }

    // Update account balance
    const newBalance = cuenta.saldo + (solicitud.precioFinal || 0);
    await this.prisma.cuentaCorrienteEstacion.update({
      where: { id: cuenta.id },
      data: { saldo: newBalance },
    });

    // Create movement
    await this.prisma.movimientoCuentaCorriente.create({
      data: {
        cuentaCorrienteId: cuenta.id,
        tipoMovimiento: TipoMovimientoCuenta.COMPRA,
        fecha: new Date(),
        monto: solicitud.precioFinal || 0,
        referencia: solicitudId,
        observacion: `Solicitud ${solicitud.numero}`,
      },
    });

    // Update solicitud to LIQUIDADO
    await this.prisma.solicitudCombustible.update({
      where: { id: solicitudId },
      data: {
        estado: EstadoSolicitudCombustible.LIQUIDADO,
        reconciliadoEl: new Date(),
      },
    });
  }

  private async logAudit(
    userId: string,
    entidad: string,
    entidadId: string,
    accion: string,
    datosAnteriores: any,
    datosNuevos: any
  ) {
    await this.prisma.auditLog.create({
      data: {
        usuarioId: userId,
        entidad,
        entidadId,
        accion,
        datosAnteriores: datosAnteriores ? JSON.stringify(datosAnteriores) : null,
        datosNuevos: JSON.stringify(datosNuevos),
        fecha: new Date(),
      },
    });
  }
}

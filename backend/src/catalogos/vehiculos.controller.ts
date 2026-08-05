import {
  BadRequestException, Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RolesGuard } from "../auth/roles.guard";
import { Roles } from "../auth/roles.decorator";
import { ORGANIZACION_PRISMA } from "../prisma/organizacion-prisma.token";
import { OrganizacionPrismaClient } from "../prisma/organizacion-prisma.client";
import { parsearCsv, filasComoObjetos, validarEncabezados, LIMITE_FILAS_IMPORTACION_CSV } from "../common/csv";
import { mensajeErrorImportacion } from "../common/importacion-errores";
import { normalizarCuit, normalizarPatente } from "../common/normalizacion";
import { CreateVehiculoDto } from "./dto/create-vehiculo.dto";
import { UpdateVehiculoDto } from "./dto/update-vehiculo.dto";

// CAT-2: mismas columnas de CreateVehiculoDto, salvo "transportistaId" — igual criterio que la
// plantilla de choferes: se resuelve por CUIT del transportista, nunca por ID interno.
const PLANTILLA_VEHICULOS_CSV =
  'transportistaCuit,patente,marca,modelo,tipo,capacidadKg,vencimientoRto,vencimientoSeguro\n' +
  '30-12345678-9,AB123CD,Mercedes-Benz,Actros,CAMION,28000,2027-03-01,2027-01-15\n';

// CAT-2: columnas sin las cuales ninguna fila podría procesarse (transportistaCuit resuelve la
// relación; patente y tipo son obligatorios en CreateVehiculoDto). Mismo criterio que Choferes:
// se valida el encabezado antes de leer una sola fila.
const ENCABEZADOS_OBLIGATORIOS_VEHICULOS = ["transportistaCuit", "patente", "tipo"];

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("vehiculos")
export class VehiculosController {
  constructor(@Inject(ORGANIZACION_PRISMA) private prisma: OrganizacionPrismaClient) {}

  // CAT-2: declarado antes de cualquier ruta con :id (VehiculosController no tiene @Get(":id")
  // hoy, pero se mantiene el mismo criterio defensivo que Choferes/Transportistas). Misma matriz
  // de roles que importar().
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Get("importar/plantilla")
  plantillaImportacion(@Res() res: Response) {
    res.set({
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-vehiculos.csv"',
    });
    res.send(PLANTILLA_VEHICULOS_CSV);
  }

  // CAT-2 (importación masiva de Vehículos): mismo criterio que ChoferesController.importar()
  // — ver comentario largo ahí (resolución de transportista por CUIT, aislamiento por
  // organización sin distinguir "inexistente" de "de otra organización", duplicados de patente
  // en lote contra la base y dentro del archivo, sin AuditLog porque create() tampoco lo genera
  // hoy). Solo cambia la clave de duplicado (patente en vez de CUIL) y los campos propios de
  // Vehiculo (tipo, capacidadKg, vencimientos).
  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post("importar")
  @UseInterceptors(FileInterceptor("archivo", { limits: { fileSize: 2 * 1024 * 1024 } }))
  async importar(@UploadedFile() archivo?: Express.Multer.File) {
    if (!archivo) throw new BadRequestException("Debe adjuntar un archivo CSV en el campo 'archivo'.");
    const filasCrudas = parsearCsv(archivo.buffer.toString("utf-8"));
    if (filasCrudas.length === 0) throw new BadRequestException("El archivo está vacío.");

    // CAT-2: el archivo se rechaza COMPLETO, antes de leer una sola fila de datos y antes de
    // cualquier consulta o escritura, si el encabezado es inválido o si excede el límite de
    // filas.
    const errorEncabezados = validarEncabezados(filasCrudas[0], ENCABEZADOS_OBLIGATORIOS_VEHICULOS);
    if (errorEncabezados) throw new BadRequestException(errorEncabezados);

    const filasDeDatos = filasCrudas.length - 1;
    if (filasDeDatos === 0) throw new BadRequestException("El archivo no tiene filas de datos para importar.");
    if (filasDeDatos > LIMITE_FILAS_IMPORTACION_CSV) {
      throw new BadRequestException(
        `El archivo supera el límite de ${LIMITE_FILAS_IMPORTACION_CSV} filas de datos (tiene ${filasDeDatos}).`,
      );
    }

    const filas = filasComoObjetos(filasCrudas);

    // CAT-3: normalizado (no solo .trim()) ANTES de armar las claves de consulta — el CUIT
    // almacenado en Transportista ya es canónico (mismo DTO normalizado), así que la clave de
    // búsqueda tiene que serlo también o un CSV con guiones nunca resolvería el transportista.
    const cuitsDelArchivo = Array.from(new Set(filas.map((f) => normalizarCuit(f.transportistaCuit || "")).filter(Boolean)));
    const transportistas = cuitsDelArchivo.length
      ? await this.prisma.transportista.findMany({ where: { cuit: { in: cuitsDelArchivo } }, select: { id: true, cuit: true } })
      : [];
    const idPorCuit = new Map(transportistas.map((t) => [t.cuit, t.id]));

    const patentesDelArchivo = Array.from(new Set(filas.map((f) => normalizarPatente(f.patente || "")).filter(Boolean)));
    const existentes = patentesDelArchivo.length
      ? await this.prisma.vehiculo.findMany({ where: { patente: { in: patentesDelArchivo } }, select: { patente: true } })
      : [];
    const patentesEnBase = new Set(existentes.map((v) => v.patente));
    const patentesVistasEnArchivo = new Set<string>();

    const detalle: { fila: number; ok: boolean; mensaje: string }[] = [];
    let creados = 0;
    for (let i = 0; i < filas.length; i++) {
      const numeroFila = i + 2;
      const registro = filas[i];

      const cuitTransportista = normalizarCuit(registro.transportistaCuit || "");
      if (!cuitTransportista) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: "transportistaCuit es obligatorio." });
        continue;
      }
      const transportistaId = idPorCuit.get(cuitTransportista);
      if (!transportistaId) {
        detalle.push({
          fila: numeroFila,
          ok: false,
          mensaje: `No existe un transportista con CUIT '${cuitTransportista}' en esta organización.`,
        });
        continue;
      }

      const dto = plainToInstance(CreateVehiculoDto, {
        transportistaId,
        patente: registro.patente,
        marca: registro.marca || undefined,
        modelo: registro.modelo || undefined,
        tipo: registro.tipo,
        capacidadKg: registro.capacidadKg || undefined,
        vencimientoRto: registro.vencimientoRto || undefined,
        vencimientoSeguro: registro.vencimientoSeguro || undefined,
      });
      const errores = await validate(dto);
      if (errores.length > 0) {
        const mensaje = errores.flatMap((e) => Object.values(e.constraints || {})).join("; ");
        detalle.push({ fila: numeroFila, ok: false, mensaje });
        continue;
      }

      if (patentesEnBase.has(dto.patente)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `Ya existe un vehículo con patente '${dto.patente}' en esta organización.` });
        continue;
      }
      if (patentesVistasEnArchivo.has(dto.patente)) {
        detalle.push({ fila: numeroFila, ok: false, mensaje: `Patente '${dto.patente}' duplicada dentro del archivo.` });
        continue;
      }
      patentesVistasEnArchivo.add(dto.patente);

      try {
        await this.prisma.vehiculo.create({
          data: {
            transportistaId: dto.transportistaId,
            patente: dto.patente,
            marca: dto.marca || null,
            modelo: dto.modelo || null,
            tipo: dto.tipo,
            capacidadKg: dto.capacidadKg ?? undefined,
            vencimientoRto: dto.vencimientoRto ? new Date(dto.vencimientoRto) : null,
            vencimientoSeguro: dto.vencimientoSeguro ? new Date(dto.vencimientoSeguro) : null,
          },
        });
        creados++;
        detalle.push({ fila: numeroFila, ok: true, mensaje: "Creado correctamente." });
      } catch (error) {
        // CAT-2: última defensa ante concurrencia (dos filas o dos importaciones simultáneas
        // apuntando a la misma patente). Nunca se devuelve error.message crudo — ver
        // mensajeErrorImportacion.
        detalle.push({ fila: numeroFila, ok: false, mensaje: mensajeErrorImportacion(error) });
      }
    }
    return { total: filas.length, creados, rechazados: filas.length - creados, detalle };
  }

  @Get()
  findAll(
    @Query("transportistaId") transportistaId?: string,
    @Query("incluirInactivos") incluirInactivos?: string,
  ) {
    const where: any = {};
    if (transportistaId) where.transportistaId = transportistaId;
    if (incluirInactivos !== "true") where.activo = true;
    return this.prisma.vehiculo.findMany({ where, orderBy: { patente: "asc" } });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Post()
  create(@Body() body: CreateVehiculoDto) {
    return this.prisma.vehiculo.create({ data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateVehiculoDto) {
    return this.prisma.vehiculo.update({ where: { id }, data: body });
  }

  @Roles("OPERACIONES", "ADMINISTRADOR")
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.prisma.vehiculo.update({ where: { id }, data: { activo: false } });
  }
}

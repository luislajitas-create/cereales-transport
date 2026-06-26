import { Module } from "@nestjs/common";
import { ClientesController } from "./clientes.controller";
import { TransportistasController } from "./transportistas.controller";
import { ChoferesController } from "./choferes.controller";
import { VehiculosController } from "./vehiculos.controller";
import {
  CerealesController,
  UbicacionesController,
  TiposGastoController,
  ProductoresController,
  UsuariosController,
} from "./simples.controller";

@Module({
  controllers: [
    ClientesController,
    TransportistasController,
    ChoferesController,
    VehiculosController,
    CerealesController,
    UbicacionesController,
    TiposGastoController,
    ProductoresController,
    UsuariosController,
  ],
})
export class CatalogosModule {}

import { ArgumentsHost, NotFoundException } from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

function crearHostMock() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const response = { status };
  const request = { method: "GET", url: "/api/v1/lo-que-sea" };

  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => request,
    }),
  } as unknown as ArgumentsHost;

  return { host, status, json };
}

describe("AllExceptionsFilter", () => {
  it("preserva el status y el body de una HttpException existente (ej. NotFoundException)", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = crearHostMock();

    filter.catch(new NotFoundException("Cliente no encontrado."), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 404, message: "Cliente no encontrado." }),
    );
  });

  it("devuelve 500 genérico (sin filtrar detalles internos) ante un Error no anticipado", () => {
    const filter = new AllExceptionsFilter();
    const { host, status, json } = crearHostMock();

    filter.catch(new Error("boom interno"), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      statusCode: 500,
      message: "Error interno del servidor",
      path: "/api/v1/lo-que-sea",
    });
  });

  it("no lanza y devuelve 500 ante un valor no-Error", () => {
    const filter = new AllExceptionsFilter();
    const { host, status } = crearHostMock();

    expect(() => filter.catch("string rara lanzada", host)).not.toThrow();
    expect(status).toHaveBeenCalledWith(500);
  });
});

const sendMailMock = jest.fn();
const createTransportMock = jest.fn(function createTransport(_options: unknown) {
  return { sendMail: sendMailMock };
});

jest.mock("nodemailer", () => ({
  createTransport: (options: unknown) => createTransportMock(options),
}));

describe("NotificadorService (NOTIF-1)", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_FROM;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function cargarServicio() {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { NotificadorService } = require("./notificador.service");
    return new NotificadorService();
  }

  it("sin variables SMTP_*, no intenta crear un transporter (comportamiento idéntico al anterior a NOTIF-1)", () => {
    cargarServicio();
    expect(createTransportMock).not.toHaveBeenCalled();
  });

  it("sin proveedor configurado, enviarRecuperacionContrasena no lanza y no llama a sendMail", async () => {
    const servicio = cargarServicio();
    await expect(servicio.enviarRecuperacionContrasena("a@demo.com", "http://x/reset?token=abc")).resolves.toBeUndefined();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("con SMTP_* configurado, enviarInvitacionUsuario llama a sendMail con destinatario y enlace en el cuerpo", async () => {
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user@test.com";
    process.env.SMTP_PASS = "secret";
    sendMailMock.mockResolvedValue({ messageId: "1" });

    const servicio = cargarServicio();
    await servicio.enviarInvitacionUsuario("b@demo.com", "http://x/invite?token=xyz");

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.test.com", port: 587, auth: { user: "user@test.com", pass: "secret" } }),
    );
    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: "b@demo.com", text: expect.stringContaining("http://x/invite?token=xyz") }),
    );
  });

  it("con SMTP_* configurado pero sendMail falla, no lanza (nunca bloquea al caller)", async () => {
    process.env.SMTP_HOST = "smtp.test.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "user@test.com";
    process.env.SMTP_PASS = "secret";
    sendMailMock.mockRejectedValue(new Error("conexión rechazada"));

    const servicio = cargarServicio();
    await expect(servicio.enviarBienvenidaOrganizacion("c@demo.com", "Cereal SA")).resolves.toBeUndefined();
    expect(sendMailMock).toHaveBeenCalled();
  });

  it("con solo alguna variable SMTP_* seteada (config incompleta), no crea transporter", () => {
    process.env.SMTP_HOST = "smtp.test.com";
    // SMTP_PORT/SMTP_USER/SMTP_PASS ausentes.
    cargarServicio();
    expect(createTransportMock).not.toHaveBeenCalled();
  });
});

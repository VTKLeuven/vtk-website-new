import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverMail: vi.fn(),
  create: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@vtk/mail", () => ({
  defaultMailFrom: () => "VTK <website@vtk.be>",
  smtpConfigured: () => true,
  deliverMail: mocks.deliverMail,
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    emailLog: {
      create: mocks.create,
      deleteMany: mocks.deleteMany,
    },
  },
}));

const { sendMail } = await import("@/lib/email");

beforeEach(() => {
  mocks.deliverMail.mockReset();
  mocks.create.mockReset().mockResolvedValue({ id: "log-1" });
  mocks.deleteMany.mockReset().mockResolvedValue({ count: 0 });
});

describe("het centrale e-maillogboek", () => {
  it("bewaart adressering, providerresultaat en enkel metadata van bijlagen", async () => {
    mocks.deliverMail.mockResolvedValue({
      status: "partial",
      messageId: "<provider-1@vtk.be>",
      response: "250 accepted",
      accepted: ["jan@example.com"],
      rejected: ["oud@example.com"],
    });

    await expect(
      sendMail(
        {
          to: "jan@example.com, oud@example.com",
          cc: ["archief@vtk.be"],
          replyTo: "vragen@vtk.be",
          subject: "Testbericht",
          text: "Hallo",
          attachments: [
            {
              filename: "rekening.pdf",
              contentType: "application/pdf",
              content: Buffer.from("pdf-bytes"),
            },
          ],
        },
        { source: "expenses" },
      ),
    ).resolves.toBe(true);

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "PARTIAL",
        source: "expenses",
        from: "VTK <website@vtk.be>",
        to: "jan@example.com, oud@example.com",
        cc: "archief@vtk.be",
        replyTo: "vragen@vtk.be",
        subject: "Testbericht",
        text: "Hallo",
        providerMessageId: "<provider-1@vtk.be>",
        providerResponse: "250 accepted",
        accepted: ["jan@example.com"],
        rejected: ["oud@example.com"],
        attachments: [
          { filename: "rekening.pdf", contentType: "application/pdf", bytes: 9 },
        ],
      }),
    });
    const data = mocks.create.mock.calls[0]?.[0]?.data;
    expect(data.attachments[0]).not.toHaveProperty("content");
  });

  it("logt een SMTP-fout voordat throwOnError ze doorgeeft", async () => {
    const smtpError = Object.assign(new Error("relay unavailable"), {
      code: "ECONNECTION",
      command: "CONN",
    });
    mocks.deliverMail.mockResolvedValue({ status: "failed", error: smtpError });

    await expect(
      sendMail(
        { to: "jan@example.com", subject: "Test", text: "Bericht" },
        { source: "website", throwOnError: true },
      ),
    ).rejects.toBe(smtpError);

    expect(mocks.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        error: expect.stringContaining("ECONNECTION"),
      }),
    });
  });

  it("laat een geslaagde verzending niet mislukken wanneer de logtabel stuk is", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.deliverMail.mockResolvedValue({
      status: "sent",
      messageId: "<provider-2@vtk.be>",
      response: "250 ok",
      accepted: ["jan@example.com"],
      rejected: [],
    });
    mocks.create.mockRejectedValue(new Error("database unavailable"));

    await expect(
      sendMail({ to: "jan@example.com", subject: "Test", text: "Bericht" }),
    ).resolves.toBe(true);

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

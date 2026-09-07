// Lokale nabootsing van de Payconiq-API, om de betaalwijzekeuze en de
// Bancontact-pagina te kunnen uitproberen zonder merchantcontract.
// Start met: node scripts/dev/bancontact-stub.mjs
import { createServer } from "node:http";

const payments = new Map();
const json = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost:4010");
  const parts = url.pathname.split("/").filter(Boolean);
  let body = "";
  for await (const chunk of req) body += chunk;

  if (req.method === "POST" && url.pathname === "/v3/payments") {
    const input = JSON.parse(body || "{}");
    const id = `pay_${Math.random().toString(36).slice(2, 10)}`;
    const payment = {
      paymentId: id, status: "PENDING", amount: input.amount, currency: input.currency,
      reference: input.reference, description: input.description,
      _links: { deeplink: { href: `https://payconiq.com/pay/2/${id}` } },
    };
    payments.set(id, payment);
    console.log(`[stub] created ${id} (${input.amount} ${input.currency})`);
    console.log(`[stub] mark paid: curl -X POST localhost:4010/control/pay/${id}`);
    return json(res, 201, payment);
  }

  if (parts[0] === "v3" && parts[1] === "payments" && parts[2]) {
    const payment = payments.get(parts[2]);
    if (!payment) return json(res, 404, { message: "Unknown payment" });
    if (req.method === "DELETE") {
      if (payment.status === "SUCCEEDED") return json(res, 409, { message: "Not cancelable" });
      payment.status = "CANCELLED";
      console.log(`[stub] cancelled ${payment.paymentId}`);
      return json(res, 204, {});
    }
    return json(res, 200, payment);
  }

  if (req.method === "POST" && parts[0] === "control" && parts[1] === "pay" && parts[2]) {
    const payment = payments.get(parts[2]);
    if (!payment) return json(res, 404, { message: "Unknown payment" });
    payment.status = "SUCCEEDED";
    console.log(`[stub] ${payment.paymentId} SUCCEEDED`);
    return json(res, 200, payment);
  }
  return json(res, 404, { message: "Not found" });
}).listen(4010, () => console.log("[stub] Bancontact stub on http://localhost:4010"));

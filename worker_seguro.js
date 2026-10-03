const ESP32 = "http://marrecoserver.duckdns.org:8321";
const ORIGEM_PERMITIDA = "https://ogioni.github.io";

const ROTAS_PUBLICAS = new Set([
  "/status.png",
  "/status.json"
]);

const ROTAS_PROTEGIDAS = new Set([
  "/ligar",
  "/joincode",
  "/config",
  "/admin-auth"
]);

export default {
  async fetch(request, env) {
    const entrada = new URL(request.url);

    if (request.method === "OPTIONS") {
      return respostaCors(null, 204);
    }

    if (ROTAS_PUBLICAS.has(entrada.pathname)) {
      return encaminharESP32(entrada, "GET", null, env);
    }

    if (!ROTAS_PROTEGIDAS.has(entrada.pathname) || request.method !== "POST") {
      return respostaCors("Rota não permitida", 404);
    }

    let dados;
    try {
      dados = await request.json();
    } catch {
      return respostaCors(JSON.stringify({ erro: "Corpo JSON inválido" }), 400, "application/json");
    }

    const senha = typeof dados?.senha === "string" ? dados.senha : "";
    const segredoEsperado = entrada.pathname === "/admin-auth" || entrada.pathname === "/config"
      ? env.CONFIG_PASSWORD
      : env.ADMIN_PASSWORD;

    if (!senha || senha !== segredoEsperado) {
      return respostaCors(JSON.stringify({ erro: "Não autorizado" }), 401, "application/json");
    }

    if (entrada.pathname === "/admin-auth") {
      return respostaCors(JSON.stringify({ ok: true }), 200, "application/json");
    }

    if (entrada.pathname === "/config") {
      return encaminharESP32(
        new URL("/config", entrada.origin),
        "GET",
        `senha=${encodeURIComponent(env.ESP32_JOINCODE_PASSWORD)}`,
        env
      );
    }

    if (entrada.pathname === "/ligar") {
      return encaminharESP32(
        new URL("/ligar", entrada.origin),
        "GET",
        `senha=${encodeURIComponent(env.ESP32_LIGAR_PASSWORD)}`,
        env
      );
    }

    return encaminharESP32(
      new URL("/joincode", entrada.origin),
      "GET",
      `senha=${encodeURIComponent(env.ESP32_JOINCODE_PASSWORD)}`,
      env
    );
  }
};

async function encaminharESP32(entrada, metodo, busca, env) {
  const destino = new URL(ESP32 + entrada.pathname);
  if (busca) destino.search = busca;
  else if (entrada.search) destino.search = entrada.search;

  try {
    const resposta = await fetch(destino.toString(), {
      method: metodo,
      redirect: "follow"
    });

    const headers = new Headers(resposta.headers);
    aplicarCors(headers);
    headers.set("Cache-Control", "no-store");

    return new Response(resposta.body, {
      status: resposta.status,
      statusText: resposta.statusText,
      headers
    });
  } catch {
    return respostaCors(
      JSON.stringify({ erro: "Não foi possível acessar o ESP32" }),
      502,
      "application/json"
    );
  }
}

function aplicarCors(headers) {
  headers.set("Access-Control-Allow-Origin", ORIGEM_PERMITIDA);
  headers.set("Vary", "Origin");
  headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
}

function respostaCors(corpo, status, tipo = "text/plain") {
  const headers = new Headers({
    "Content-Type": tipo,
    "Cache-Control": "no-store"
  });
  aplicarCors(headers);
  return new Response(corpo, { status, headers });
}

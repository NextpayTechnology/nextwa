/**
 * nextzapp — exemplo end-to-end
 *
 * Roda: `node example.js`
 *
 * O que o script faz:
 *  1. Conecta no WhatsApp, imprime QR no terminal na primeira vez
 *  2. Persiste a auth em ./auth_info_nextzapp/ (escaneia só 1x)
 *  3. Quando recebe qualquer mensagem de usuário, responde com:
 *     - um texto "pong"
 *     - uma mensagem com botões (testa os 7 patches, em especial o PATCH-005)
 *
 * Se o botão chegar no seu celular, os patches estão funcionando end-to-end.
 * Se não chegar (cenário do PATCH-005: "enviado" do lado remetente, nada no
 * destinatário), algo está errado no fluxo de reporting-token / biz stanza.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("./lib");
const { Boom } = require("@hapi/boom");
const P = require("pino");
const qrcode = require("qrcode-terminal");

const logger = P({ level: "warn" });

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info_nextzapp");
  const { version } = await fetchLatestBaileysVersion();
  console.log(`[nextzapp] usando WA v${version.join(".")}`);

  const sock = makeWASocket({
    version,
    auth: state,
    logger,
    browser: ["nextzapp test", "Chrome", "1.0.0"]
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      console.log("\n[nextzapp] escaneie o QR abaixo com seu WhatsApp:\n");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = code !== DisconnectReason.loggedOut;
      console.log(
        `[nextzapp] conexão fechada (code=${code}). Reconectando? ${shouldReconnect}`
      );
      if (shouldReconnect) {
        start();
      }
    } else if (connection === "open") {
      console.log("[nextzapp] conectado! esperando mensagens...");
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const jid = msg.key.remoteJid;
      if (!jid || jid === "status@broadcast") continue;

      console.log(`[nextzapp] mensagem recebida de ${jid}`);

      try {
        await sock.sendMessage(jid, { text: "pong — nextzapp ativo" });

        await sock.sendMessage(jid, {
          text: "Teste de botões (PATCH-002 a PATCH-007).\nSe você está vendo isso com botões abaixo, os 7 patches funcionam.",
          footer: "nextzapp",
          buttons: [
            { buttonId: "opt_1", buttonText: { displayText: "Opção A" }, type: 1 },
            { buttonId: "opt_2", buttonText: { displayText: "Opção B" }, type: 1 },
            { buttonId: "opt_3", buttonText: { displayText: "Opção C" }, type: 1 }
          ],
          headerType: 1
        });

        console.log(`[nextzapp] respondido (texto + botões) → ${jid}`);
      } catch (err) {
        console.error(`[nextzapp] falha ao responder ${jid}:`, err);
      }
    }
  });
}

start().catch(err => {
  console.error("[nextzapp] erro fatal:", err);
  process.exit(1);
});

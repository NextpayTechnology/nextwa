# nextzapp — API WhatsApp Web em TypeScript/JavaScript

Versão baseada no [Baileys 6.x](https://github.com/WhiskeySockets/Baileys) (commit `15b6247`, v6.7.21). Compatível com a v6.x de [whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

Obrigado a todos os contribuidores do [whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) pelo trabalho feito até aqui.

## Por que mais um fork do Baileys?

- Não é uma nova versão. O código é usado em produção há anos, com milhares de conexões ativas.
- Mantido internamente pela **NextpayTechnology** para o produto **imp-zapp**.
- Esta versão prioriza **simplicidade e estabilidade** em relação a ter todas as features do mundo.
- Cada patch é testado end-to-end antes de entrar na `main`. A `main` é sempre estável.
- O Baileys oficial **remove periodicamente recursos** que usamos em produção (botões, listas, templates). Manter um fork controlado nos dá patches em horas, não semanas de espera.

Detalhes dos patches aplicados: veja [PATCHES.md](PATCHES.md). Versão-base e procedimento de atualização: [UPSTREAM.md](UPSTREAM.md).

## Limitações conhecidas desta versão

O foco é manter a funcionalidade central (mensagens 1-a-1 + grupos básicos + mensagens ricas). Algumas features específicas (Meta AI, catálogo, tags avançadas, adicionar/remover contatos) podem não estar disponíveis e só serão portadas se não adicionarem complexidade excessiva de manutenção.

## Descrição geral

O `nextzapp` não precisa de Selenium nem de navegador para conversar com o WhatsApp Web — ele fala direto via **WebSocket**. Isso economiza meio gigabyte de RAM comparado a soluções com Chromium.

Suporta a versão **Multi-Device** do WhatsApp (a única suportada pelo WA atualmente).

Agradecimentos a [@pokearaujo](https://github.com/pokearaujo/multidevice) pelas observações sobre o protocolo MD, [@Sigalor](https://github.com/sigalor/whatsapp-web-reveng) pelo trabalho sobre o WA Web, e [@Rhymen](https://github.com/Rhymen/go-whatsapp/) pela implementação em Go.

A biblioteca é tipada, extensível e simples de usar. Se precisar de mais funcionalidade do que ela entrega por padrão, é simples escrever uma extensão. Veja a seção [Escrevendo Funcionalidades Customizadas](#escrevendo-funcionalidades-customizadas).

## Exemplo

Confira e rode `example.ts` para ver um uso completo da biblioteca. O script cobre a maioria dos casos comuns.

Para rodar:

1. `cd path/to/nextzapp`
2. `npm install`
3. `npm run example`

## Instalação

Instalação via git (pacote privado, não publicado em registry público):

```
npm i git+https://github.com/NextpayTechnology/nextzapp.git#main
```

Depois importe no seu código:

```ts
import makeWASocket from "nextzapp";
```

## Testes Unitários

TODO

## Conectando

```ts
import makeWASocket, { DisconnectReason } from "nextzapp";
import { Boom } from "@hapi/boom";

async function connectToWhatsApp() {
  const sock = makeWASocket({
    // configurações adicionais aqui
    printQRInTerminal: true
  });
  sock.ev.on("connection.update", update => {
    const { connection, lastDisconnect } = update;
    if (connection === "close") {
      const shouldReconnect =
        (lastDisconnect.error as Boom)?.output?.statusCode !==
        DisconnectReason.loggedOut;
      console.log(
        "conexão fechada por causa de ",
        lastDisconnect.error,
        ", reconectando? ",
        shouldReconnect
      );
      // reconecta se não foi logout
      if (shouldReconnect) {
        connectToWhatsApp();
      }
    } else if (connection === "open") {
      console.log("conexão aberta");
    }
  });
  sock.ev.on("messages.upsert", async m => {
    console.log(JSON.stringify(m, undefined, 2));

    console.log("respondendo para", m.messages[0].key.remoteJid);
    await sock.sendMessage(m.messages[0].key.remoteJid!, {
      text: "Olá!"
    });
  });
}
// roda no arquivo principal
connectToWhatsApp();
```

Se a conexão for bem-sucedida, um QR Code será impresso no terminal. Escaneie com o WhatsApp no celular e você estará logado.

**Obs:** instale `qrcode-terminal` via `npm i qrcode-terminal` para que o QR seja renderizado no terminal automaticamente.

**Obs:** o código legado do WA Web (pré multi-device) foi removido na v5. Só a conexão MD padrão é suportada — o WA parou de suportar a versão antiga.

## Configurando a Conexão

Passe um objeto `SocketConfig` para configurar a conexão:

```ts
type SocketConfig = {
  /** URL do WebSocket do WA */
  waWebSocketUrl: string | URL;
  /** Falha a conexão se o socket estourar esse timeout */
  connectTimeoutMs: number;
  /** Timeout padrão para queries, `undefined` para sem timeout */
  defaultQueryTimeoutMs: number | undefined;
  /** Intervalo de ping-pong no WS */
  keepAliveIntervalMs: number;
  /** agent do proxy */
  agent?: Agent;
  /** logger pino */
  logger: Logger;
  /** versão para conectar */
  version: WAVersion;
  /** sobrescrita de browser */
  browser: WABrowserDescription;
  /** agent para requisições fetch (upload/download de mídia) */
  fetchAgent?: Agent;
  /** imprimir QR no terminal */
  printQRInTerminal: boolean;
  /** emitir eventos para ações feitas por esta conexão */
  emitOwnEvents: boolean;
  /** cache de mídia (evita reupload) */
  mediaCache?: NodeCache;
  /** hosts customizados para upload de mídia */
  customUploadHosts: MediaConnInfo["hosts"];
  /** intervalo entre retries de mensagens */
  retryRequestDelayMs: number;
  /** tempo até gerar o próximo QR */
  qrTimeout?: number;
  /** estado de autenticação */
  auth: AuthenticationState;
  /** controla o history sync; por padrão sincroniza tudo */
  shouldSyncHistoryMessage: (
    msg: proto.Message.IHistorySyncNotification
  ) => boolean;
  /** opções de transação para o SignalKeyStore */
  transactionOpts: TransactionCapabilityOptions;
  /** cache do device-list do usuário */
  userDevicesCache?: NodeCache;
  /** marca o cliente online quando o socket abre */
  markOnlineOnConnect: boolean;
  /** map de retries por mensagem */
  msgRetryCounterMap?: MessageRetryMap;
  /** largura do thumbnail de link preview */
  linkPreviewImageThumbnailWidth: number;
  /** pedir histórico completo ao telefone */
  syncFullHistory: boolean;
  /** disparar queries de init automaticamente (default true) */
  fireInitQueries: boolean;
  /** gerar link preview de alta qualidade (faz upload do thumb pro WA) */
  generateHighQualityLinkPreview: boolean;
  /** opções do axios */
  options: AxiosRequestConfig<any>;
  /**
   * buscar uma mensagem no seu store local.
   * implemente para que mensagens que falharam no envio possam ser retentadas
   * (resolve o "essa mensagem pode demorar um pouco")
   */
  getMessage: (key: proto.IMessageKey) => Promise<proto.IMessage | undefined>;
};
```

### Emulando o app desktop em vez do browser

1. Por padrão, o `nextzapp` emula uma sessão Chrome web.
2. Para emular uma conexão desktop (e receber mais histórico), use:
   ```ts
   const conn = makeWASocket({
     ...outrasOpts,
     // Windows, Ubuntu, macOS
     browser: Browsers.macOS("Desktop"),
     syncFullHistory: true
   });
   ```

## Salvando e Restaurando Sessões

Você não quer escanear o QR toda vez que conecta. Carregue as credenciais salvas para voltar logado:

```ts
import makeWASocket, { BufferJSON, useMultiFileAuthState } from "nextzapp";
import * as fs from "fs";

// utilitário que salva o auth state em uma pasta
// serve como guia pra você implementar em SQL/noSQL em produção
const { state, saveCreds } = await useMultiFileAuthState("auth_info_nextzapp");
// conecta usando o state — se as credenciais forem válidas, não pede QR
const conn = makeWASocket({ auth: state });
// chamado sempre que as credenciais são atualizadas
conn.ev.on("creds.update", saveCreds);
```

**Obs:** Quando uma mensagem é enviada/recebida, as chaves do Signal precisam ser atualizadas (`authState.keys`). Sempre que isso acontece, é **obrigatório** persistir as novas chaves — caso contrário, mensagens subsequentes não chegam ao destinatário. `useMultiFileAuthState` cuida disso automaticamente; se você for escrever sua própria camada de persistência (SQL/Redis), **preste muita atenção** nesse fluxo.

## Escutando Atualizações de Conexão

O evento `connection.update` notifica mudanças de estado. Estrutura:

```ts
type ConnectionState = {
  /** aberto, conectando ou fechado */
  connection: WAConnectionState;
  /** erro que derrubou a conexão */
  lastDisconnect?: {
    error: Error;
    date: Date;
  };
  /** login novo */
  isNewLogin?: boolean;
  /** QR code atual */
  qr?: string;
  /** se o device recebeu todas as notificações pendentes do período offline */
  receivedPendingNotifications?: boolean;
};
```

**Obs:** o QR também chega aqui, via `update.qr`.

## Lidando com Eventos

O `nextzapp` usa `EventEmitter` e os eventos são 100% tipados — use um editor com IntelliSense (VS Code):

```ts
export type BaileysEventMap = {
  /** estado da conexão mudou — WS fechou, abriu, conectando, etc. */
  "connection.update": Partial<ConnectionState>;
  /** credenciais atualizadas — metadata, chaves, etc. */
  "creds.update": Partial<AuthenticationCreds>;
  /** history sync, ordenado por data decrescente */
  "messaging-history.set": {
    chats: Chat[];
    contacts: Contact[];
    messages: WAMessage[];
    isLatest: boolean;
  };
  /** upsert de chats */
  "chats.upsert": Chat[];
  /** update dos chats indicados */
  "chats.update": Partial<Chat>[];
  /** deletar chats pelos IDs */
  "chats.delete": string[];
  /** presença de um contato em um chat */
  "presence.update": {
    id: string;
    presences: { [participant: string]: PresenceData };
  };

  "contacts.upsert": Contact[];
  "contacts.update": Partial<Contact>[];

  "messages.delete": { keys: WAMessageKey[] } | { jid: string; all: true };
  "messages.update": WAMessageUpdate[];
  "messages.media-update": {
    key: WAMessageKey;
    media?: { ciphertext: Uint8Array; iv: Uint8Array };
    error?: Boom;
  }[];
  /**
   * adiciona/atualiza mensagens. Se a conexão estava online,
   * o update vem com type: "notify"
   */
  "messages.upsert": { messages: WAMessage[]; type: MessageUpsertType };
  /** reação a mensagem. Se a reação foi removida, "reaction.text" vem vazio */
  "messages.reaction": { key: WAMessageKey; reaction: proto.IReaction }[];

  "message-receipt.update": MessageUserReceiptUpdate[];

  "groups.upsert": GroupMetadata[];
  "groups.update": Partial<GroupMetadata>[];
  /** aplicar ação em participantes de um grupo */
  "group-participants.update": {
    id: string;
    participants: string[];
    action: ParticipantAction;
  };

  "blocklist.set": { blocklist: string[] };
  "blocklist.update": { blocklist: string[]; type: "add" | "remove" };
  /** update de chamada (recebida, rejeitada, aceita) */
  call: WACallEvent[];
};
```

Para escutar:

```ts
const sock = makeWASocket();
sock.ev.on("messages.upsert", ({ messages }) => {
  console.log("mensagens recebidas", messages);
});
```

## Implementando um Data Store

O `nextzapp` não vem com storage padrão para chats, contatos ou mensagens. Há uma implementação simples em memória que escuta os eventos e mantém o estado atualizado:

```ts
import makeWASocket, { makeInMemoryStore } from "nextzapp";
// store mantém o estado da conexão em memória
// pode ser persistido em arquivo e restaurado
const store = makeInMemoryStore({});
// restaurar de arquivo
store.readFromFile("./nextzapp_store.json");
// salvar em arquivo a cada 10s
setInterval(() => {
  store.writeToFile("./nextzapp_store.json");
}, 10_000);

const sock = makeWASocket({});
// escuta o socket
// o store pode ser reusado em uma nova conexão quando a atual morrer
store.bind(sock.ev);

sock.ev.on("chats.set", () => {
  // use `store.chats` como quiser, mesmo depois do socket cair
  console.log("chats", store.chats.all());
});

sock.ev.on("contacts.set", () => {
  console.log("contatos", Object.values(store.contacts));
});
```

**Obs:** recomendo **fortemente** você implementar seu próprio store, especialmente em produção MD — manter o histórico inteiro de alguém na RAM é um desperdício absurdo.

## Enviando Mensagens

**Uma única função (`sendMessage`) envia todo tipo de mensagem:**

### Mensagens não-mídia

```ts
import { MessageType, MessageOptions, Mimetype } from "nextzapp";

const id = "abcd@s.whatsapp.net"; // WhatsApp ID do destinatário

// texto simples
const sentMsg = await sock.sendMessage(id, { text: "olá!" });

// resposta a uma mensagem
const sentMsg = await sock.sendMessage(
  id,
  { text: "olá!" },
  { quoted: message }
);

// menção
const sentMsg = await sock.sendMessage(id, {
  text: "@12345678901",
  mentions: ["12345678901@s.whatsapp.net"]
});

// localização
const sentMsg = await sock.sendMessage(id, {
  location: { degreesLatitude: 24.121231, degreesLongitude: 55.1121221 }
});

// contato (vCard)
const vcard =
  "BEGIN:VCARD\n" +
  "VERSION:3.0\n" +
  "FN:João Silva\n" +
  "ORG:NextpayTechnology;\n" +
  "TEL;type=CELL;type=VOICE;waid=5511999999999:+55 11 99999-9999\n" +
  "END:VCARD";
const sentMsg = await sock.sendMessage(id, {
  contacts: {
    displayName: "João",
    contacts: [{ vcard }]
  }
});

// mensagem com botões
const buttons = [
  { buttonId: "id1", buttonText: { displayText: "Botão 1" }, type: 1 },
  { buttonId: "id2", buttonText: { displayText: "Botão 2" }, type: 1 },
  { buttonId: "id3", buttonText: { displayText: "Botão 3" }, type: 1 }
];

const buttonMessage = {
  text: "Olá, essa é uma mensagem com botões",
  footer: "Rodapé",
  buttons: buttons,
  headerType: 1
};

const sendMsg = await sock.sendMessage(id, buttonMessage);

// template message
const templateButtons = [
  {
    index: 1,
    urlButton: {
      displayText: "⭐ nextzapp no GitHub!",
      url: "https://github.com/NextpayTechnology/nextzapp"
    }
  },
  {
    index: 2,
    callButton: {
      displayText: "Me ligue!",
      phoneNumber: "+55 11 99999-9999"
    }
  },
  {
    index: 3,
    quickReplyButton: {
      displayText: "Isso é uma resposta rápida",
      id: "id-quick-reply"
    }
  }
];

const templateMessage = {
  text: "Olá, essa é uma template message",
  footer: "Rodapé",
  templateButtons: templateButtons
};

const sendMsg = await sock.sendMessage(id, templateMessage);

// list message
const sections = [
  {
    title: "Seção 1",
    rows: [
      { title: "Opção 1", rowId: "option1" },
      {
        title: "Opção 2",
        rowId: "option2",
        description: "Descrição da opção"
      }
    ]
  },
  {
    title: "Seção 2",
    rows: [
      { title: "Opção 3", rowId: "option3" },
      {
        title: "Opção 4",
        rowId: "option4",
        description: "Outra descrição"
      }
    ]
  }
];

const listMessage = {
  text: "Essa é uma lista",
  footer: "rodapé, link: https://google.com",
  title: "Título em negrito",
  buttonText: "Ver opções",
  sections
};

const sendMsg = await sock.sendMessage(id, listMessage);

// reação
const reactionMessage = {
  react: {
    text: "💖", // string vazia remove a reação
    key: message.key
  }
};

const sendMsg = await sock.sendMessage(id, reactionMessage);
```

### Enviando mensagens com preview de link

1. O WA MD não gera preview quando enviado via web.
2. O `nextzapp` tem uma função que gera o preview.
3. Para ativar: `npm i link-preview-js`
4. Enviar:

```ts
// envia um link
const sentMsg = await sock.sendMessage(id, {
  text: "Oi, confere aí: https://github.com/NextpayTechnology/nextzapp"
});
```

### Mensagens de Mídia

Enviar mídia (vídeo, stickers, imagens) é eficiente:

- Você pode passar um buffer, uma URL local ou uma URL remota.
- Ao passar uma URL, o `nextzapp` **nunca** carrega o buffer inteiro na memória — ele criptografa a mídia como um stream legível.

```ts
import { MessageType, MessageOptions, Mimetype } from "nextzapp";

// GIF
await sock.sendMessage(id, {
  video: fs.readFileSync("Media/meu_gif.mp4"),
  caption: "olá!",
  gifPlayback: true
});

await sock.sendMessage(id, {
  video: "./Media/meu_gif.mp4",
  caption: "olá!",
  gifPlayback: true
});

// áudio
await sock.sendMessage(id, {
  audio: { url: "./Media/audio.mp3" },
  mimetype: "audio/mp4"
});

// botões com imagem no header
const buttons = [
  { buttonId: "id1", buttonText: { displayText: "Botão 1" }, type: 1 },
  { buttonId: "id2", buttonText: { displayText: "Botão 2" }, type: 1 },
  { buttonId: "id3", buttonText: { displayText: "Botão 3" }, type: 1 }
];

const buttonMessage = {
  image: { url: "https://example.com/image.jpeg" },
  caption: "Mensagem com botões e imagem",
  footer: "Rodapé",
  buttons: buttons,
  headerType: 4
};

const sendMsg = await sock.sendMessage(id, buttonMessage);

// template message com imagem anexada
const templateButtons = [
  {
    index: 1,
    urlButton: {
      displayText: "⭐ nextzapp no GitHub!",
      url: "https://github.com/NextpayTechnology/nextzapp"
    }
  },
  {
    index: 2,
    callButton: {
      displayText: "Me ligue!",
      phoneNumber: "+55 11 99999-9999"
    }
  },
  {
    index: 3,
    quickReplyButton: {
      displayText: "Resposta rápida",
      id: "id-quick-reply"
    }
  }
];

const templateMessage = {
  text: "Template message com imagem",
  footer: "Rodapé",
  templateButtons: templateButtons,
  image: { url: "https://example.com/image.jpeg" }
};

const sendMsg = await sock.sendMessage(id, templateMessage);
```

### Observações

- `id` é o WhatsApp ID do destinatário (pessoa ou grupo).
  - Formato: `[código do país][número]@s.whatsapp.net`
  - Exemplo: `5511999999999@s.whatsapp.net`
  - Para grupos: `123456789-123345@g.us`
  - Para broadcast: `[timestamp de criação]@broadcast`
  - Para stories: `status@broadcast`
- Thumbnails podem ser gerados automaticamente para imagens e stickers se você tiver `jimp` ou `sharp` instalado (`npm i jimp` ou `npm i sharp`). Thumbnails de vídeo precisam do `ffmpeg` no sistema.
- **MiscGenerationOptions**: opcionais extras para mensagem:
  ```ts
  const info: MessageOptions = {
    quoted: quotedMessage, // mensagem citada
    contextInfo: { forwardingScore: 2, isForwarded: true },
    timestamp: Date(), // timestamp manual
    caption: "olá!", // caption de mídia (stickers não aceitam)
    jpegThumbnail: "23GD#4/==", // base64 de JPEG pra thumb customizada
    mimetype: Mimetype.pdf, // mimetype pra mídia
    fileName: "arquivo.pdf", // nome do arquivo (mídia)
    ptt: true, // envia áudio como voice note
    /** envia como mensagem efêmera.
     * default 'chat' — segue a configuração do chat */
    ephemeralExpiration: WA_DEFAULT_EPHEMERAL
  };
  ```

## Encaminhando Mensagens

```ts
const msg = getMessageFromStore("455@s.whatsapp.net", "HSJHJWH7323HSJSJ"); // implemente
await sock.sendMessage("1234@s.whatsapp.net", { forward: msg });
```

## Marcando Mensagens como Lidas

No MD, você precisa marcar mensagens explicitamente — não dá pra marcar um chat inteiro:

```ts
const key = {
  remoteJid: "1234-123@g.us",
  id: "AHASHH123123AHGA", // id da mensagem
  participant: "912121232@s.whatsapp.net" // quem enviou (undefined em 1:1)
};
// pode passar várias keys
await sock.readMessages([key]);
```

O ID da mensagem é acessível via `message.key.id`.

## Atualizando a Presença

```ts
await sock.sendPresenceUpdate("available", id);
```

Avisa o destinatário se você está online, offline, digitando, etc.

Valores possíveis:

```ts
type WAPresence =
  | "unavailable"
  | "available"
  | "composing"
  | "recording"
  | "paused";
```

A presença expira em ~10s.

**Obs:** No MD, se um cliente desktop estiver ativo, o WA não envia push para o device. Para receber push, marque seu cliente offline com `sock.sendPresenceUpdate('unavailable')`.

## Baixando Mensagens de Mídia

```ts
import { writeFile } from "fs/promises";
import { downloadMediaMessage } from "nextzapp";

sock.ev.on("messages.upsert", async ({ messages }) => {
  const m = messages[0];

  if (!m.message) return;
  const messageType = Object.keys(m.message)[0];

  if (messageType === "imageMessage") {
    const buffer = await downloadMediaMessage(
      m,
      "buffer",
      {},
      {
        logger,
        // permite pedir reupload de mídia deletada
        reuploadRequest: sock.updateMediaMessage
      }
    );
    await writeFile("./download.jpeg", buffer);
  }
});
```

**Obs:** o WhatsApp remove mídia antiga dos servidores. Para acessar mídia antiga, é necessário um reupload por outro device:

```ts
const updatedMediaMsg = await sock.updateMediaMessage(msg);
```

## Deletando Mensagens

```ts
const jid = "1234@s.whatsapp.net"; // pode ser grupo também
const response = await sock.sendMessage(jid, { text: "olá!" });
// deleta pra todos
await sock.sendMessage(jid, { delete: response.key });
```

**Obs:** deletar só pra mim é feito via `chatModify` (próxima seção).

## Modificando Chats

O WA usa comunicação criptografada pra sincronizar updates de chat. Você pode:

- Arquivar um chat
  ```ts
  const lastMsgInChat = await getLastMessageInChat("123456@s.whatsapp.net");
  await sock.chatModify(
    { archive: true, lastMessages: [lastMsgInChat] },
    "123456@s.whatsapp.net"
  );
  ```
- Mutar / desmutar
  ```ts
  // mudo por 8 horas
  await sock.chatModify(
    { mute: 8 * 60 * 60 * 1000 },
    "123456@s.whatsapp.net",
    []
  );
  // desmuta
  await sock.chatModify({ mute: null }, "123456@s.whatsapp.net", []);
  ```
- Marcar como lido / não lido

  ```ts
  const lastMsgInChat = await getLastMessageInChat("123456@s.whatsapp.net");
  await sock.chatModify(
    { markRead: false, lastMessages: [lastMsgInChat] },
    "123456@s.whatsapp.net"
  );
  ```

- Deletar uma mensagem pra mim

  ```ts
  await sock.chatModify(
    {
      clear: {
        messages: [
          { id: "ATWYHDNNWU81732J", fromMe: true, timestamp: "1654823909" }
        ]
      }
    },
    "123456@s.whatsapp.net",
    []
  );
  ```

- Deletar um chat

  ```ts
  const lastMsgInChat = await getLastMessageInChat("123456@s.whatsapp.net");
  await sock.chatModify(
    {
      delete: true,
      lastMessages: [
        {
          key: lastMsgInChat.key,
          messageTimestamp: lastMsgInChat.messageTimestamp
        }
      ]
    },
    "123456@s.whatsapp.net"
  );
  ```

- Fixar / desafixar
  ```ts
  await sock.chatModify(
    {
      pin: true // false pra desafixar
    },
    "123456@s.whatsapp.net"
  );
  ```

**Obs:** se você errar um update, o WA pode deslogar você de todos os devices e você terá que logar de novo.

## Mensagens Efêmeras

```ts
const jid = "1234@s.whatsapp.net"; // pode ser grupo
// liga mensagens efêmeras
await sock.sendMessage(
  jid,
  // 1 semana em segundos
  { disappearingMessagesInChat: WA_DEFAULT_EPHEMERAL }
);
// envia uma mensagem efêmera isolada
await sock.sendMessage(
  jid,
  { text: "olá" },
  { ephemeralExpiration: WA_DEFAULT_EPHEMERAL }
);
// desliga
await sock.sendMessage(jid, { disappearingMessagesInChat: false });
```

## Utilidades

- Verificar se um ID está no WhatsApp
  ```ts
  const id = "5511999999999";
  const [result] = await sock.onWhatsApp(id);
  if (result.exists)
    console.log(`${id} está no WA, jid: ${result.jid}`);
  ```
- Consultar status de alguém
  ```ts
  const status = await sock.fetchStatus("xyz@s.whatsapp.net");
  console.log("status: " + status);
  ```
- Mudar seu próprio status
  ```ts
  await sock.updateProfileStatus("Olá mundo!");
  ```
- Mudar seu nome
  ```ts
  await sock.updateProfileName("Meu nome");
  ```
- Pegar a foto de perfil de alguém / grupo
  ```ts
  // baixa qualidade
  const ppUrl = await sock.profilePictureUrl("xyz@g.us");
  // alta qualidade
  const ppUrl = await sock.profilePictureUrl("xyz@g.us", "image");
  ```
- Trocar sua foto de perfil (ou a de um grupo)
  ```ts
  const jid = "111234567890-1594482450@g.us"; // pode ser o seu também
  await sock.updateProfilePicture(jid, { url: "./nova-foto.jpeg" });
  ```
- Pegar presença de alguém
  ```ts
  sock.ev.on("presence-update", json => console.log(json));
  await sock.presenceSubscribe("xyz@s.whatsapp.net");
  ```
- Bloquear / desbloquear
  ```ts
  await sock.updateBlockStatus("xyz@s.whatsapp.net", "block");
  await sock.updateBlockStatus("xyz@s.whatsapp.net", "unblock");
  ```
- Pegar perfil business
  ```ts
  const profile = await sock.getBusinessProfile("xyz@s.whatsapp.net");
  console.log(`descrição: ${profile.description}, categoria: ${profile.category}`);
  ```

## Grupos

- Criar grupo
  ```ts
  const group = await sock.groupCreate("Meu Grupo", [
    "5511999999999@s.whatsapp.net",
    "5511888888888@s.whatsapp.net"
  ]);
  console.log("grupo criado com id: " + group.gid);
  sock.sendMessage(group.id, { text: "olá pessoal!" });
  ```
- Adicionar / remover / promover / rebaixar
  ```ts
  const response = await sock.groupParticipantsUpdate(
    "abcd-xyz@g.us",
    ["abcd@s.whatsapp.net", "efgh@s.whatsapp.net"],
    "add" // ou "remove", "demote", "promote"
  );
  ```
- Trocar nome do grupo
  ```ts
  await sock.groupUpdateSubject("abcd-xyz@g.us", "Novo nome!");
  ```
- Trocar descrição do grupo
  ```ts
  await sock.groupUpdateDescription("abcd-xyz@g.us", "Nova descrição!");
  ```
- Mudar configurações do grupo
  ```ts
  // só admins enviam
  await sock.groupSettingUpdate("abcd-xyz@g.us", "announcement");
  // todos enviam
  await sock.groupSettingUpdate("abcd-xyz@g.us", "not_announcement");
  // todos podem editar configurações (foto, nome)
  await sock.groupSettingUpdate("abcd-xyz@g.us", "unlocked");
  // só admins editam configurações
  await sock.groupSettingUpdate("abcd-xyz@g.us", "locked");
  ```
- Sair do grupo
  ```ts
  await sock.groupLeave("abcd-xyz@g.us");
  ```
- Pegar o código de convite
  ```ts
  const code = await sock.groupInviteCode("abcd-xyz@g.us");
  ```
- Revogar o código de convite
  ```ts
  const code = await sock.groupRevokeInvite("abcd-xyz@g.us");
  ```
- Consultar metadata do grupo
  ```ts
  const metadata = await sock.groupMetadata("abcd-xyz@g.us");
  console.log(
    `${metadata.id}, título: ${metadata.subject}, descrição: ${metadata.desc}`
  );
  ```
- Entrar em grupo via código de convite
  ```ts
  const response = await sock.groupAcceptInvite("xxx");
  ```
- Informação do grupo via código
  ```ts
  const response = await sock.groupGetInviteInfo("xxx");
  ```
- Entrar via `groupInviteMessage`
  ```ts
  const response = await sock.groupAcceptInviteV4(
    "abcd@s.whatsapp.net",
    groupInviteMessage
  );
  ```

## Listas de Broadcast e Stories

**Obs:** mensagens atualmente não podem ser enviadas para broadcast lists na versão MD.

- Mensagens para broadcast funcionam igual às de grupos e 1:1.
- O WA Web não suporta criar broadcast lists, mas você pode deletar.
- IDs de broadcast: `12345678@broadcast`
- Consultar destinatários e nome:
  ```ts
  const bList = await sock.getBroadcastListInfo("1234@broadcast");
  console.log(`lista: ${bList.name}, destinatários: ${bList.recipients}`);
  ```

## Escrevendo Funcionalidades Customizadas

O `nextzapp` foi escrito pensando em extensão. Em vez de fazer fork do fork, escreva suas próprias extensões.

Habilite o log de mensagens não-tratadas do WhatsApp:

```ts
const sock = makeWASocket({
  logger: P({ level: "debug" })
});
```

Isso mostra no console todas as mensagens que o WA envia. Exemplo:

1. Trackear a bateria do celular. Com o log ligado, aparece algo tipo:
   `{"level":10,"fromMe":false,"frame":{"tag":"ib","attrs":{"from":"@s.whatsapp.net"},"content":[{"tag":"edge_routing","attrs":{},"content":[{"tag":"routing_info","attrs":{},"content":{"type":"Buffer","data":[8,2,8,5]}}]}]},"msg":"communication"}`

   O `frame` tem três partes:
   - `tag` — o tipo (ex: `message`)
   - `attrs` — key-value com metadata (normalmente o ID)
   - `content` — o conteúdo real
   - Mais detalhes em [/src/WABinary/readme.md](/src/WABinary/readme.md)

   Para registrar um callback:

   ```ts
   // qualquer mensagem com tag 'edge_routing'
   sock.ws.on(`CB:edge_routing`, (node: BinaryNode) => {});
   // tag 'edge_routing' e attr id=abcd
   sock.ws.on(`CB:edge_routing,id:abcd`, (node: BinaryNode) => {});
   // tag 'edge_routing', attr id=abcd e primeiro content node routing_info
   sock.ws.on(`CB:edge_routing,id:abcd,routing_info`, (node: BinaryNode) => {});
   ```

## Licença

MIT — herdada do upstream. Veja [LICENSE](LICENSE).

Este projeto **não é afiliado ao WhatsApp**. Use com bom senso. Não envie spam.

# Patches aplicados sobre o upstream

Cada divergência do fork em relação ao upstream (ver `UPSTREAM.md`) é
registrada aqui em ordem cronológica. Isto é o **changelog real do fork**.

Formato de cada entrada:

- **ID** — `PATCH-NNN` sequencial, usado em mensagens de commit.
- **Título** — curto, imperativo.
- **Data** — quando foi aplicado.
- **Arquivos** — paths afetados dentro de `src/` ou `WAProto/`.
- **Motivação** — por que foi necessário.
- **Risco / manutenção** — o que pode quebrar em upgrade upstream.
- **Origem** — commit ou referência externa (ex.: whaileys).

---

## PATCH-000: Import inicial do Baileys v6.7.21

- **Data:** 2026-04-22
- **Arquivos:** todos os arquivos importados via tarball.
- **Motivação:** estabelecer baseline. Nenhuma modificação funcional.
- **Risco:** baixo — cópia literal do upstream.
- **Origem:** WhiskeySockets/Baileys @ `15b6247ccf7dabd9d4db9ae055121170881f8ea1`.

---

## PATCH-001: Build verde no monorepo (Node 20+ tipos modernos)

- **Data:** 2026-04-22
- **Arquivos:**
  - `src/typings/baileys-patches.d.ts` *(novo)* — declara módulos
    `libsignal`, `link-preview-js`, augmenta `jimp` com símbolos que o
    upstream usa dinamicamente.
  - `src/Utils/crypto.ts` — 3 casts `as unknown as BufferSource` em chamadas
    de `subtle.importKey`/`deriveBits` (hkdf + derivePairingCodeKey). Motivo:
    Node 20+ tipa `Uint8Array` com `ArrayBufferLike` (inclui
    `SharedArrayBuffer`); Web Crypto exige `ArrayBuffer`. Em runtime o valor
    é sempre `ArrayBuffer` — o cast é seguro, apenas silencia o tsc.
- **Motivação:** permitir `npm run build` verde para o pacote ser
  consumível via workspace `@impzapp/wa-core` pelo backend.
- **Risco:** zero funcional — mudanças são só de tipagem (declarações locais
  e casts). Nenhum comportamento de runtime alterado.
- **Manutenção em upgrade upstream:** se o Baileys atualizar `crypto.ts` ou
  `libsignal.ts`, revisar se estes patches ainda se aplicam ao mesmo shape
  de função. Em geral são pontos estáveis.

---

## PATCH-002: Tipos `Buttonable` / `Templatable` / `Listable`

- **Data:** 2026-04-22
- **Arquivos:** `src/Types/Message.ts`
- **Motivação:** restaurar a API pública de envio com botões interativos e
  list messages que o Baileys upstream removeu da tipagem. Os protos
  subjacentes (`proto.Message.ButtonsMessage`, `proto.IHydratedTemplateButton`,
  `proto.Message.ListMessage`) continuam todos presentes no upstream —
  faltava apenas o front-end type.
- **Mudanças:**
  - Declara 3 tipos mixin: `Buttonable` (`buttons?`), `Templatable`
    (`templateButtons?` + `footer?`), `Listable` (`sections?`, `title?`,
    `buttonText?`).
  - Mixa em `AnyMediaMessageContent` (image / video / document ganham
    `Buttonable & Templatable`) e em `AnyRegularMessageContent` (text
    ganha os três mixins).
- **Origem:** `node_modules/whaileys/lib/Types/Message.d.ts` linhas 74-93.
- **Risco:** baixo — adiciona campos opcionais à união. Não altera shape
  de runtime, só amplia o que TypeScript aceita na assinatura.
- **Manutenção em upgrade upstream:** se o Baileys voltar a exportar
  esses tipos, remover o PATCH-002 (detectar conflito = oportunidade).

---

## PATCH-003: Lógica de `generateWAMessageContent` para botões / lista

- **Data:** 2026-04-22
- **Arquivos:** `src/Utils/messages.ts`
- **Motivação:** transformar o payload tipado (PATCH-002) em `proto.IMessage`
  correto que o WhatsApp aceita como botões.
- **Mudanças:** insere bloco entre `requestPhoneNumberMessage` e
  `viewOnceMessage`:
  - `buttons` → `proto.buttonsMessage` com `headerType` inferido do media
    type (`IMAGE` / `VIDEO` / `DOCUMENT` / `EMPTY`), botões do tipo
    `RESPONSE`, e `footerText` quando presente.
  - `templateButtons` → `proto.templateMessage.fourRowTemplate`
    (+ `hydratedTemplate` duplicado — compatibilidade com iOS antigo).
  - `sections` → `proto.listMessage` com `listType: SINGLE_SELECT`.
- **Origem:** `node_modules/whaileys/lib/Utils/messages.js` linhas 298-355.
- **Risco:** médio — caminho de envio adicional. Se o WhatsApp mudar a
  aceitação destes message types, o patch precisa acompanhar. Recepção
  (`normalizeMessageContent`, `extractFromTemplateMessage`) já existia no
  upstream, então a parte de receber / responder continua idêntica.
- **Manutenção em upgrade upstream:** se o upstream refatorar
  `generateWAMessageContent` (área quente), revisar como as novas
  condições `if (...) m = {...}` se encaixam no fluxo.

---

## PATCH-004: Branch `interactiveMessage` em `generateWAMessageContent`

- **Data:** 2026-04-22
- **Arquivo:** `src/Utils/messages.ts`
- **Motivação:** o Baileys upstream **removeu** o elif `interactiveMessage`.
  Quando o backend envia `sock.sendMessage(jid, { interactiveMessage: {...} })`
  — usado em botões url/call e CTAs ricos — o payload caía no `else` final
  que chama `prepareWAMessageMedia`, que não encontra chave de mídia
  (`image`/`video`/`audio`/etc) e lança `Boom('Invalid media type')`.
  Sintoma em produção: campanhas com templates de botões falhando com
  `"Error: Invalid media type"` em todos os envios.
- **Mudança:** adicionado branch `else if ('interactiveMessage' in message)`
  que passa o proto direto para `m.interactiveMessage` — o Baileys já
  serializa sem transformação extra.
- **Origem:** whaileys `Utils/messages.js` linhas 279-281.
- **Risco:** baixo — elif no mesmo padrão dos já existentes (`product`,
  `requestPhoneNumber`). Não afeta outros paths.
- **Manutenção em upgrade:** se o upstream voltar a aceitar
  `interactiveMessage`, remover o patch (detectar via diff).

---

## PATCH-005: Reporting token — **crítico para entrega real**

- **Data:** 2026-04-22
- **Arquivos:**
  - `src/Utils/reporting-utils.ts` *(novo)* — port completo de
    `whaileys/lib/Utils/reporting-utils.js`. Implementa
    `shouldIncludeReportingToken` + `getMessageReportingToken` com todo o
    maquinário de varint encode/decode de protobuf e extração dos campos
    `reportingFields` pra HMAC-SHA256.
  - `src/Utils/messages.ts` — no final de `generateWAMessageContent`,
    aplica `messageContextInfo.messageSecret = randomBytes(32)` quando
    `shouldIncludeReportingToken(m)` retorna true (tudo exceto reaction
    e poll-update).
  - `src/Socket/messages-send.ts` — antes de `sendNode(stanza)`, anexa
    `<reporting>` binary node com o HMAC derivado do messageSecret.
  - `src/Utils/crypto.ts` — `hkdf` agora aceita `info: string | Buffer |
    Uint8Array` (reporting-utils passa buffer binário).
- **Motivação:** **era o motivo real das campanhas "dizerem que enviaram
  mas nada chegar".** O WhatsApp aceita o `POST` de mensagens sem
  messageSecret e responde ACK, mas **descarta no server** — sintoma de
  ✓ local sem entrega. Todas as mensagens ricas (interactiveMessage,
  buttonsMessage, templateMessage, listMessage) exigem o token.
  O Baileys upstream v6.7.21 removeu este mecanismo.
- **Risco:** baixo — block idempotente condicional (só roda se qualifica),
  HMAC fora do main path (não bloqueia se falhar — log warn e segue).
- **Manutenção:** se o WhatsApp mudar o algoritmo de reporting (mudar
  `reportingFields` ou o marcador `"Report Token"`), re-sincronizar
  com a versão mais recente do whaileys ou Baileys atual.

---

## PATCH-006: Hack do `documentWithCaptionMessage` — **BOTÕES CHEGAM**

- **Data:** 2026-04-22
- **Arquivos:**
  - `src/Utils/messages.ts` — nova função exportada `patchMessageForMdIfRequired`.
  - `src/Defaults/index.ts` — default `patchMessageBeforeSending` agora usa
    `patchMessageForMdIfRequired` em vez de no-op (`msg => msg`).
- **Motivação:** o WhatsApp **bloqueia entrega de botões/listas/interactive
  messages para clientes consumer**. O hack descoberto pela comunidade
  Baileys (e mantido pelo whaileys) é envelopar a mensagem inteira em
  `documentWithCaptionMessage.message` — isso faz o WA tratar como envio
  de documento com caption e entregar o conteúdo rico dentro. Comentário
  original do whaileys: *"this is an experimental patch to make buttons
  work. Don't know how it works, but it does for now."*
- **Mudança:**
  ```ts
  if (msg.buttonsMessage || msg.listMessage || msg.interactiveMessage) {
    return { documentWithCaptionMessage: { message: {...msg} } }
  }
  ```
- **Origem:** `whaileys/Utils/messages.js` linhas 720-739.
- **Risco:** baixo. Só afeta mensagens ricas. Se o WhatsApp fechar esse
  workaround um dia, mensagens ricas voltam a falhar — o que é mesmo
  status do whaileys.
- **Manutenção:** se o WhatsApp ressuscitar suporte oficial de botões
  (improvável) ou se aparecer um jeito melhor, remover o patch.

---

## PATCH-007: `<biz>` binary node — sinalização no stanza

- **Data:** 2026-04-22
- **Arquivos:** `src/Socket/messages-send.ts`
- **Motivação:** mesmo com `documentWithCaptionMessage` envelopando
  (PATCH-006), o WhatsApp **exige um binary node `<biz>` explícito**
  no stanza para reconhecer a mensagem como interativa e renderizar os
  botões no destinatário. Sem este node, o cliente WA aceita mas renderiza
  apenas o documento-isca sem os botões.
- **Mudança:**
  - Nova função interna `createButtonNode(innerMessage)`:
    - `listMessage` → `<list type="product_list" v="2">`
    - `buttonsMessage` / `interactiveMessage.nativeFlowMessage` →
      `<interactive type="native_flow" v="1"><native_flow v="9" name="mixed"/>`
  - Antes de `sendNode(stanza)`, lê DENTRO do envelope
    `documentWithCaptionMessage.message` (porque PATCH-006 já envelopou)
    e injeta o `<biz>` node no stanza se aplicável.
- **Origem:** `whaileys/Socket/messages-send.js` linhas 268-289 e 523-532.
- **Risco:** baixo — só adiciona binary node em stanzas ricos. Mensagens
  de texto puro não são afetadas.

---

<!--
Próximos patches previstos (ainda não aplicados):
- PATCH-008: Adaptar whatsapp.service.ts para consumir via IWaDriver
- PATCH-009: … (adicionar conforme aplicarmos)
-->

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

## PATCH-010: Upgrade Baileys v6.7.21 → v7.0.0-rc.9

- **Data:** 2026-04-23
- **Arquivos:** todos os `src/`, `WAProto/`, `proto-extract/`, `tsconfigs`,
  `package.json`.
- **Motivação:** v6.7.21 tem 8 meses. O WhatsApp mudou muito o protocolo
  MD nesse período (hosted LID, reorganização de Signal sessions, retry
  manager novo, protobuf 80% menor). O v7.0.0-rc.9 traz as atualizações
  necessárias (LID nativo, Meta Coexistence, mutex no Signal key store).
- **Estratégia:** fresh import via tarball, preservando nosso
  `package.json`, docs e `src/typings/baileys-patches.d.ts`. Os 6 patches
  funcionais (002-007) foram reaplicados sobre a estrutura nova —
  reancorados em tokens (não linhas), sem reescrita arquitetural.
- **Obsoletos após upgrade** (upstream já incorporou equivalente):
  - **PATCH-001** — v7 já tem casts `as BufferSource` em `crypto.ts`
    (subtle.importKey/deriveBits).
  - **PATCH-008** — v7 já tem `version: { primary, secondary, tertiary }`
    dentro do `DeviceProps` em `validate-connection.ts`.
  - **PATCH-009** — v7 trata LID nativamente. Usa
    `createSignalIdentity(lid!, accountSignatureKey!)` (sem fallback JID)
    e persiste `me.lid`. Nosso fork não precisa mais intervir.
- **Adicionado no baileys-patches.d.ts:**
  - Stub de `music-metadata` (pacote pure-ESM — type-only import
    incompatível com CJS quebraria o tsc; declaramos o shape mínimo com
    arity variádica pra cobrir v7.x e v11.x).
  - `SessionRecord.haveOpenSession()` e `SignalStorage` interface no stub
    de libsignal.
- **Ajustes de tsconfig.json:**
  - `module: "Node16"`, `moduleResolution: "Node16"` (aceita imports com
    `.js` que o v7 usa em todo src/).
  - `allowImportingTsExtensions: false`.
- **Ajustes de package.json:**
  - Removido `axios` (v7 upstream não usa mais).
  - Adicionado `lru-cache@^11`.
  - Adicionado `p-queue@^6.6.2` (CJS — v7 upstream usa `^9.0.0` que é
    ESM-only; pinamos na última release 6.x CJS-compatível).
- **hkdf signature** (`crypto.ts`): info.info aceita `string | Buffer |
  Uint8Array` pra reporting-utils (PATCH-005) continuar funcionando.
- **Risco:** médio-alto em produção. RC ainda não é stable — recomenda-se
  canário. Sessions no disco devem continuar compatíveis.
- **Origem:** WhiskeySockets/Baileys @ `v7.0.0-rc.9` tag.

---

## PATCH-008..017: Patches pós-v7 não documentados (dívida histórica)

- **Data:** entre 2026-04-23 e 2026-05-05
- **Status:** marcadores `[PATCH-NNN]` presentes no código, sem entrada em
  PATCHES.md. Aplicados após o upgrade pra v7 mas a doc não foi atualizada.
- **Mapeamento (inferido por inspeção):**
  - **PATCH-008** (`Utils/messages.ts:218`) — audio waveform fix; PTT bitrate.
  - **PATCH-009** (15 refs) — tc-token (TrustedContact) sync. Arquivos:
    `Types/Auth.ts`, `Utils/tc-token-utils.ts`, `Utils/index.ts`,
    `Socket/messages-recv.ts`, `Socket/messages-send.ts`. Relacionado a
    incorporação nativa de tc-token no v7.
  - **PATCH-011** (2 refs) — `Socket/messages-recv.ts`. Função desconhecida.
  - **PATCH-012** (6 refs) — `Socket/messages-recv.ts`. Função desconhecida.
  - **PATCH-013** (9 refs) — `Utils/identity-change.ts` (novo arquivo) +
    `Socket/messages-recv.ts`. Identity-change handler unificado, port
    direto do Baileys master. Relacionado a tc-token reissue.
  - **PATCH-014** (3 refs) — `Socket/messages-recv.ts`. Função desconhecida.
  - **PATCH-015** (5 refs) — `Types/GroupMetadata.ts` + `Socket/messages-recv.ts`.
    Mudanças em meta de grupos.
  - **PATCH-016** (7 refs) — `Utils/history.ts` + `Utils/process-message.ts`.
    Persistência de pares LID↔PN extraídos de history sync conversations.
    Crítico: sem isso, primeira campanha pós-pareamento batia em LID errado.
  - **PATCH-017** (2 refs) — `Types/Message.ts` + `Utils/messages.ts`.
- **Risco:** baixo (já em produção há semanas). Documentar foi adiado mas
  o código está estável.
- **Recomendação:** quando alguém tocar uma dessas áreas, completar a doc
  daquele patch específico. Não retroagir tudo de uma vez.

---

## PATCH-018: cherry-pick Baileys 8ca9316a — JID validation em `updateBlockStatus`

- **Data:** 2026-05-06
- **Arquivos:** `src/Socket/chats.ts`
- **Motivação:** o servidor WA passou a exigir tanto `jid` (LID) quanto
  `pn_jid` (PN) no item da blocklist quando action='block'. Sem isso, o
  servidor devolvia `bad-request` opaco. Esse cherry-pick valida o JID,
  resolve o par PN↔LID via `signalRepository.lidMapping`, e monta o
  payload corretamente.
- **Mudança:** adiciona helpers `isHostedLidUser`/`isHostedPnUser` ao
  import de `WABinary`, e expande `updateBlockStatus` com:
  - jid normalize via `jidNormalizedUser`
  - resolve LID↔PN bidirecional
  - throw `Boom 400` em jids malformados ou sem mapping
  - monta `itemAttrs` com `pn_jid` somente em block (unblock só precisa de jid)
- **Origem:** WhiskeySockets/Baileys @ `8ca9316a` (master HEAD em 2026-05-06).
- **Risco:** baixo. Função era quebrada antes (sempre dava bad-request);
  agora funciona conforme o servidor espera. Não usamos updateBlockStatus
  em produção ainda, mas vai estar correto quando precisarmos.
- **Manutenção:** se o servidor mudar protocolo de blocklist, esse helper
  precisa atualizar. Atualmente segue WA Web 1:1.

---

## PATCH-019: cherry-pick Baileys 798f2a93 — Null/undefined hardening

- **Data:** 2026-05-06
- **Arquivos:**
  - `src/Utils/auth-utils.ts` — adiciona `assertMeId(creds)` helper
  - `src/Socket/messages-send.ts` — usa `assertMeId` em `relayMessage`
  - `src/Socket/groups.ts` — null check em `extractGroupMetadata` com
    surface de erro do servidor
  - `src/Utils/decode-wa-message.ts` — null check de `msgId`/`from`,
    remove operadores `!` redundantes
  - `src/Utils/process-message.ts` — null check em `getChatId`
- **Motivação:** vários `!` não-checados quebravam com `TypeError` opaco
  quando socket caía antes do auth completar, OU quando server devolvia
  payload incompleto. Agora throws Boom com mensagem descritiva — fica
  rastreável no logger pino.
- **Mudanças destacadas:**
  - `assertMeId(creds)` lança `Boom 401` se `creds.me?.id` é null/empty.
  - `extractGroupMetadata` lê `<error>` node do servidor e propaga
    code+text em vez de TypeError. Mirror WAWeb behavior.
  - `decodeMessageNode` rejeita stanza sem `id` ou `from` no início.
  - `getChatId` rejeita key sem `remoteJid`.
- **Origem:** WhiskeySockets/Baileys @ `798f2a93`.
- **Risco:** baixo. Substitui crashes opacos por erros descritivos. Se
  algo lançava `TypeError` antes, agora lança `Boom` — o caller que
  catch genérico continua funcionando.
- **Manutenção:** se algum dia decidirmos que stanza malformado deve ser
  silenciosamente ignorado em vez de throw, mudar a semântica nesses 5
  pontos. Hoje preferimos fail-loud.

---

## PATCH-020: cherry-pick Baileys 0956f51f — App state sync skip undecryptable (parcial)

- **Data:** 2026-05-06
- **Arquivos:**
  - `src/Utils/chat-utils.ts` — try/catch em record-level decode
  - `src/Socket/chats.ts` — passa `logger` pra `decodeSyncdSnapshot`
  - `src/WAUSync/USyncQuery.ts` — null-safe simplification
- **Motivação:** quando o app-state sync trazia 1 record corrompido
  (server-side bug, replication race), o decode antigo dava throw que
  derrubava todo o snapshot — ~30 records perdidos por 1 poisoned. Agora
  skip-and-continue por record + soft-fail no LTHash MAC mismatch.
- **Mudanças:**
  - `decodeSyncdMutations`: HMAC mismatch e AES decrypt failure agora
    `continue` em vez de throw.
  - `decodeSyncdSnapshot`: aceita `logger?` opcional. LTHash mismatch
    vira warn em vez de throw (alinhado com `decodePatches` que já tinha
    tratamento similar).
  - `decodePatches`: try/catch em torno de `decodeSyncdPatch` — patch
    corrompido vira warn + skip; LTHash mismatch vira warn + break.
  - `parseUSyncQueryResult`: simplifica null check via optional chaining.
- **Adaptação ao nosso fork:** o cherry-pick original usa um helper
  `isMissingKeyError` pra distinguir missing-key (propagate) vs corrupted
  record (skip). Não temos esse helper — pulamos o try/catch do
  `getKey` (mantém comportamento atual de propagar). Os outros 2 pontos
  (HMAC, AES) ganharam o skip.
- **Hunk pulado:** `src/Signal/libsignal.ts` modifica uma função
  `signalStorage` mais complexa que não temos (nosso fork tem implementação
  simplificada com `isTrustedIdentity: () => true`). Sem aplicabilidade.
- **Origem:** WhiskeySockets/Baileys @ `0956f51f`.
- **Risco:** baixo-médio. Mudança passa de fail-fast pra fail-soft em
  alguns pontos. Se um record corrompido tinha valor crítico, antes você
  descobria pelo crash; agora descobre pelo log warn. Aceitável dado
  que o crash matava sessão inteira.
- **Manutenção:** se aparecer log "skipping" recorrente, investigar a
  origem do corrupted record (pode ser bug nosso, não do server).

---

## PATCH-021: cherry-pick Baileys 3730684e — Memory leak cleanup no socket end

- **Data:** 2026-05-06
- **Arquivos:**
  - `src/Types/Socket.ts` — adiciona `close?: () => void` em CacheStore
  - `src/Types/Signal.ts` — adiciona `close?` em SignalRepositoryWithLIDStore
  - `src/Signal/lid-mapping.ts` — adiciona `close()` no LIDMappingStore
  - `src/Signal/libsignal.ts` — adiciona `close()` no makeLibSignalRepository
  - `src/Utils/message-retry-manager.ts` — adiciona `clear()`
  - `src/Utils/event-buffer.ts` — adiciona `destroy()`
  - `src/Socket/socket.ts` — registry `socketEndHandlers` + chama no `end()`
  - `src/Socket/messages-send.ts` — registra cleanup de mediaConn/caches
  - `src/Socket/messages-recv.ts` — registra cleanup de retry/offer/identity caches
  - `src/Socket/chats.ts` — registra cleanup de awaitingSyncTimeout/syncState/privacy
- **Motivação:** rodamos múltiplas instâncias 24/7 (multi-tenant). Cada
  socket close deixava órfãos em memória: LRU caches, NodeCache instances,
  retry maps, event buffer history, timers pendentes. Em workspace ativo
  com reconnects frequentes, RSS subia ~80MB/dia sem teto. Esse fix
  centraliza um registry de end-handlers e garante release no close.
- **Mudanças destacadas:**
  - `socket.ts` ganhou `socketEndHandlers: Array<(error) => void|Promise<void>>`
    + função `registerSocketEndHandler` exposta no return de `makeSocket`.
  - `end()` virou `async` — chama `signalRepository.close?.()`, depois
    cada handler em sequência (com try/catch tolerante), depois
    `ev.destroy()`.
  - 3 subsistemas (chats, messages-recv, messages-send) registram
    seus cleanups no startup. Cada um sabe quais caches limpar.
  - Conditional close: se `config.userDevicesCache` (etc) foi passado
    pelo caller, NÃO fechamos — caller é dono daquela memória.
- **Adaptações ao nosso fork:**
  - `MessageRetryManager.clear()` não inclui `baseKeys.clear()` (campo
    do master que ainda não absorvemos).
  - `event-buffer.destroy()` não inclui `flushPendingTimeout` (campo
    do master que ainda não absorvemos).
  - Não exportamos `placeholderResendCache` no return do `makeChatsSocket`
    nem mudamos a propagação config — preservamos o setup atual e só
    registramos o cleanup handler do cache.
  - `messages-recv` continua criando seu próprio `placeholderResendCache`
    fallback se config não tem; registro só fecha o cache se internalmente
    criado.
- **Origem:** WhiskeySockets/Baileys @ `3730684e`.
- **Risco:** médio. Toca em 9 arquivos no caminho crítico de socket
  lifecycle. Validado por typecheck e smoke de boot. Em produção,
  monitorar RSS pós-reconnect: se cair como esperado, sucesso.
- **Manutenção:** quando absorvermos `baseKeys` ou `flushPendingTimeout`
  do master no futuro, completar os clear/destroy aqui.

---

## PATCH-022: pin music-metadata em 11.12.1+

- **Data:** 2026-05-06
- **Arquivos:** `package.json`
- **Motivação:** cherry-pick de Baileys `1453b06b`. Pin de versão pra
  pegar o fix de TypeScript declarations que veio em 11.12.1.
- **Mudança:** `"music-metadata": "^11.7.0"` → `"music-metadata": "11.12.1"`.
- **Origem:** WhiskeySockets/Baileys @ `1453b06b`.
- **Risco:** baixo. Versão usada: 11.12.3 (patch dentro do range).
- **Followup possível:** com TS declarations corretas em 11.12.1+,
  podemos eventualmente remover o stub manual de `music-metadata` em
  `src/typings/baileys-patches.d.ts`. Adiado por segurança — hoje o
  stub não atrapalha.

---

## ac90a2d7 — App state resilience (WA Web verified) — **NÃO APLICADO**

- **Data da análise:** 2026-05-06
- **Por que pulamos:** o cherry-pick depende de:
  1. Helpers `ensureLTHashStateVersion`, `isAppStateSyncIrrecoverable`,
     `isMissingKeyError` que ainda não absorvemos do master
  2. Dependência `whatsapp-rust-bridge` que não temos (e não pretendemos
     adicionar agora — é experimental)
  3. Infra de SyncState completa com Paused/Stalled states que veio em
     commits posteriores que não foram cherry-picked
- **Aplicar parcialmente** seria adicionar `HISTORY_SYNC_PAUSED_TIMEOUT_MS`
  (constante isolada) sem o handler que a consome — dead code.
- **Quando reconsiderar:** quando o master cortar uma release tagged
  (rc.10+) e fizermos um re-import controlado seguindo o `UPSTREAM.md`.
  Aí absorvemos o pacote inteiro de helpers + feature.

---

## bd68f1a0 — QR regression in companion-reg-client-utils — **NÃO APLICADO**

- **Data da análise:** 2026-05-06
- **Por que pulamos:** o arquivo `src/Utils/companion-reg-client-utils.ts`
  não existe no nosso fork. A feature inteira de companion-registration
  foi adicionada em `de80aab1` (master, 2026-05-02) — *depois* do nosso
  último import. O bug que `bd68f1a0` corrige veio com a feature, então
  não temos o bug porque não temos a feature.
- **Quando reconsiderar:** quando absorvermos `de80aab1` (companion
  registration utilities) numa onda futura, aplicar `bd68f1a0` junto.

---

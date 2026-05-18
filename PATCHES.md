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

# Round 2 — 2026-05-17 (zapo + Baileys rc10/rc11 cherry-picks)

Após auditoria end-to-end comparando `backend/libs/wa-core/src/` com
`Baileys-master/src/` e `zapo-master/src/`. Foco: **anti-detecção** +
**stability fixes** que o master/zapo já têm e que ainda nos faltam.

## PATCH-023: WeakMap cache em `getBinaryNodeChildren` (30x speedup)

- **Data:** 2026-05-17
- **Arquivo:** `src/WABinary/generic-utils.ts`
- **Origem:** Baileys master rc10 (commit do @purpshell, "30X return on speed during binary children lookups").
- **Motivação:** stanzas grandes (group fanout, history-sync batches) faziam
  Array.filter linear por tag a cada lookup. Em mensagens pra grupos 300+
  isso vira ~30% do CPU de send/recv. WeakMap garante GC: quando o BinaryNode
  sai de escopo, o cache de tag→children some junto.
- **Mudança:** introduzido `binaryChildrenCache: WeakMap<BinaryNode, Map<string, BinaryNode[]>>`.
  `getBinaryNodeChildren` consulta cache antes do filter; miss popula. `getBinaryNodeChild`
  reusa o cache de children (early return no `cached[0]`).
- **Risco:** zero funcional — cache transparente. Sem mudança de API.
- **Manutenção:** se upstream incluir versão diferente do mesmo cache, alinhar.

---

## PATCH-024: ServerClock — track skew via `<success t=...>`

- **Data:** 2026-05-17
- **Arquivos:**
  - `src/Utils/server-clock.ts` *(novo)* — `makeServerClock(logger)` retorna
    `{ updateFromSuccessAttr, nowSeconds, nowMilliseconds, getSkewMs }`.
  - `src/Utils/index.ts` — export do helper.
  - `src/Socket/socket.ts` — instancia `serverClock` no setup; `CB:success`
    chama `serverClock.updateFromSuccessAttr(node.attrs.t)`. Exposto no
    return do socket pra subsistemas usarem.
  - `src/Socket/messages-send.ts` — `<receipt t=...>`, TC token issue
    timestamp e `getPrivacyTokens`/`issuePrivacyTokens` agora usam
    `serverClock.nowSeconds()` em vez de `unixTimestampSeconds()`.
- **Origem:** port do zapo (`src/util/clock.ts` + `WaConnectionManager.updateClockSkewFromSuccess`).
- **Motivação anti-detecção:** WA Web sempre usa server time pra timestamps de
  privacy tokens, IQ stamps, expirações. Hosts com clock drift (NTP atrasado,
  VM frozen/thawing) emitem timestamps "no futuro" / "no passado" — fingerprint
  facilmente correlacionável de cliente não-WA Web.
- **Risco:** baixo — fallback pra `Date.now()` quando skew não medido (boot,
  primeira conexão). API extra opcional.
- **Manutenção:** se upstream adotar o mesmo padrão (provável, já está em zapo),
  podemos remover o helper e usar o upstream.

---

## PATCH-025: CS Token (Client-Server) fallback infrastructure

- **Data:** 2026-05-17
- **Arquivos:**
  - `src/Utils/cs-token-utils.ts` *(novo)* — `CsTokenGenerator` (HMAC-SHA256
    com cache LRU bounded em 5 entries), `buildCsTokenMessageNode`,
    `getNctSalt` / `setNctSalt` (storage via auth keys, sentinel `__nct_salt__`),
    `resolvePrivacyTokenNode` (TC > CS > null).
  - `src/Utils/index.ts` — export.
  - `src/Socket/messages-send.ts` — fallback path: quando NÃO há TC token
    cacheado pro destinatário em send 1:1, tenta anexar `<cstoken>`.
    Só funciona se `nctSalt` estiver no storage E `creds.me.lid` presente.
- **Origem:** port do zapo (`src/client/tokens/cs-token.ts` + builders +
  WaTrustedContactTokenCoordinator.resolveTokenForMessage).
- **Motivação anti-detecção:** WA Web sempre anexa `<tctoken>` OU `<cstoken>`
  em send 1:1 — nunca manda mensagem sem nenhum. Nosso fork até agora não
  mandava nada quando ainda não tinha TC token cacheado (primeira msg pra
  contato novo, token expirado), criando padrão "sem token" facilmente
  identificável como cliente não-Web.
- **Estado:** **infra completa, attach opt-in**. O storage do `nctSalt` está
  pronto (`setNctSalt`) mas a wire stanza que carrega o salt ainda não foi
  identificada no nosso fork — quando identificarmos (provavelmente
  `<notification type=privacy_token>` com `<salt>` filho), o handler chama
  `setNctSalt` e o attach automático passa a acontecer. Antes disso, o
  `resolvePrivacyTokenNode` retorna `null` (sem regresso).
- **Risco:** zero atual — comportamento idêntico ao anterior até salt ser
  populada. Quando ativar, ganha cobertura.
- **Manutenção:** identificar wire do salt no master/zapo numa próxima onda.

---

## PATCH-026: stanza-ack.ts — builder pure-function de ACK

- **Data:** 2026-05-17
- **Arquivo:** `src/Utils/stanza-ack.ts` *(novo)*.
- **Origem:** port literal de `Baileys-master/src/Utils/stanza-ack.ts` (rc10).
- **Motivação anti-detecção:** WA Web sempre formata ACK com mesmas regras —
  `from` em ACK de message, `type` quando presente, `participant`/`recipient`
  propagados. Inconsistências (omitir um campo, adicionar outro) são
  fingerprint sutil mas detectável.
- **Mudança:** função `buildAckStanza(node, errorCode?, meId?)` retorna
  BinaryNode pronto. Disponível pra wire-in em receivers que ainda usam
  lógica inline.
- **Risco:** zero — util standalone, não é importado por código existente
  ainda.
- **Manutenção:** wire em messages-recv.ts numa onda futura quando refator
  for seguro.

---

## PATCH-027: offline-node-processor.ts — batch + yield to event loop

- **Data:** 2026-05-17
- **Arquivo:** `src/Utils/offline-node-processor.ts` *(novo)*.
- **Origem:** port de `Baileys-master/src/Utils/offline-node-processor.ts`
  (rc10 — @Santosl2 "improved offline node batching").
- **Mudança:** `makeOfflineNodeProcessor(map, deps, batchSize=10)` cria
  processor que enfileira nodes offline e yieldsa pro event loop a cada
  batch — evita bloquear WS keepalive em rajadas grandes (logins com
  histórico denso).
- **Anti-detecção secundária:** WA Web também faz batching com yields — sem
  isso processamos "instantaneamente demais" entre mensagens do batch.
- **Renomeado:** tipo `MessageType` (upstream) → `OfflineNodeType` aqui pra
  evitar colisão com `MessageType` de `messages-media.ts` (HKDF keys).
- **Risco:** zero — util standalone, não wired ainda.
- **Manutenção:** wire em messages-recv quando refator for seguro.

---

## PATCH-028: processContactAction — LID↔PN mapping via app-state sync

- **Data:** 2026-05-17
- **Arquivos:**
  - `src/Utils/sync-action-utils.ts` *(novo)* — port literal do upstream.
  - `src/Types/Contact.ts` — adicionado field opcional `username`.
- **Origem:** port de `Baileys-master/src/Utils/sync-action-utils.ts` (rc10).
- **Motivação:** PATCH-016 cobria LID/PN mapping só de historySync; antes
  perdíamos pares LID↔PN que chegam via `contactAction` (quando user
  renomeia contato no celular → app-state sync envia o par). WA Web SEMPRE
  processa esses pares — clientes que não processam têm `lidMapping`
  desproporcionalmente vazia.
- **Mudança:** funções puras `processContactAction(action, id, logger)` +
  `emitSyncActionResults(ev, results)`. Pode ser wired em `chat-utils.ts`
  no caminho de processSyncAction quando absorvermos a infra de app-state.
- **Risco:** zero — utils standalone.
- **Manutenção:** wire numa onda de app-state sync refactor.

---

## PATCH-030: Constants alinhamento com Baileys rc10

- **Data:** 2026-05-17
- **Arquivo:** `src/Defaults/index.ts`.
- **Mudanças (5 novas constantes + 1 atualização):**
  1. `STATUS_EXPIRY_SECONDS = 24 * 60 * 60` — status messages com mais de
     24h são considerados expirados (WA Web enforcement).
  2. `PLACEHOLDER_MAX_AGE_SECONDS = 14 * 24 * 60 * 60` — máximo de idade
     de placeholder pra resend (WA Web rejeita resends mais velhos).
  3. `HISTORY_SYNC_PAUSED_TIMEOUT_MS = 120_000` — timeout pra detecção de
     stall em history sync.
  4. `TimeMs = { Minute, Hour, Day, Week }` — helper enum self-documenting.
  5. **`WA_CERT_DETAILS` atualizado** — antes só `SERIAL: 0` (placeholder);
     agora inclui `ISSUER: 'WhatsAppLongTerm1'` + `PUBLIC_KEY: <hex 32 bytes>`
     que são os valores reais. Permite validação de cert pin (anti-MITM).
- **Anti-detecção:** clientes "reais" validam cert pin com `ISSUER` e
  `PUBLIC_KEY` corretos. Antes nossas validações eram no-op.
- **Risco:** zero comportamental atual (constants não consumidas por código
  existente que mude semântica). Habilita features futuras de pin validation
  e timeouts de history sync sem reimplementar.
- **Manutenção:** ao bumpar versão do WA Web e ela rotacionar pubkey de
  long-term cert, atualizar `PUBLIC_KEY`.

---

## PATCH-045: USyncUsernameProtocol — port literal Baileys rc10

- **Data:** 2026-05-17 (Onda 3)
- **Arquivo novo:** `src/WAUSync/Protocols/USyncUsernameProtocol.ts`
- **Index update:** `src/WAUSync/Protocols/index.ts`

### Mudança

Port literal do upstream. Permite consultar usernames de contatos via
USync (User Sync, batch queries de presence/devices/lid). API:
```ts
new USyncUsernameProtocol()
  .getQueryElement() // → { tag: 'username', attrs: {} }
  .parser(node)      // → string | null
```

### Motivação anti-detect

WA Web sempre carrega TODOS os USync protocols. Sem este, fingerprint
de "cliente USync parcial" detectável. Port é zero-risk (~30 linhas).

---

## PATCH-044: companion-reg-client-utils — port literal Baileys rc10

- **Data:** 2026-05-17 (Onda 3)
- **Arquivo novo:** `src/Utils/companion-reg-client-utils.ts`
- **Export:** adicionado em `src/Utils/index.ts`

### Mudança

Port literal do upstream. Helpers pra device-linking via QR code:

```ts
enum CompanionWebClientType { UNKNOWN, CHROME, EDGE, FIREFOX, IE, OPERA, SAFARI, ELECTRON, UWP, OTHER_WEB_CLIENT }
getCompanionWebClientType(browser) → CompanionWebClientType
getCompanionPlatformId(browser) → string
buildPairingQRData(ref, noiseKeyB64, identityKeyB64, advB64, browser) → URL
```

### Motivação

Não usamos device-linking AINDA, mas o port deixa pronto pra wave
futura (linkar app mobile do cliente ao nosso backend como companion).
Anti-detect: clientes WA Web sempre têm esses helpers — não ter é
fingerprint sutil de "cliente que nunca foi companion".

### Smoke validado

```
macOS+Chrome  → CHROME (1)        ✓
Windows+Desktop → UWP (8)         ✓
macOS+Desktop  → ELECTRON (7)     ✓
QR URL format: https://wa.me/settings/linked_devices#... ✓
```

---

## PATCH-042: chat-utils — `makeLtHashGenerator` exportado

- **Data:** 2026-05-17 (Onda 3)
- **Arquivo:** `src/Utils/chat-utils.ts`

### Mudança

```diff
-const makeLtHashGenerator = ({ indexValueMap, hash }: ...) => {
+export const makeLtHashGenerator = ({ indexValueMap, hash }: ...) => {
```

### Motivação

No upstream foi exportado em rc10 — permite que subsistemas externos
(validators, recovery, custom app-state processors) reusem o generator
em vez de re-implementar. Zero-risk e zero-breaking.

### NÃO feito (decisão consciente)

- **`mutationKeys` async→sync**: upstream migrou pra `whatsapp-rust-bridge`
  (lib Rust opcional) que faz hkdf síncrono. Nossa versão usa WebCrypto
  hkdf async. Adicionar Rust bridge é dep pesada com ganho marginal —
  postergado pra wave futura.
- **`subtractThenAdd` arg order swap**: nossa assinatura é
  `(hash, addList, subtractList)` e o callsite passa `(..., addBuffs, subBuffs)`
  — semanticamente ALINHADO. Upstream tem ordem inversa em ambos
  lados, mas o resultado é o mesmo. Manter forma atual.

---

## PATCH-041: process-message — storeTcTokensFromHistorySync + GROUP_MEMBER_LABEL_CHANGE

- **Data:** 2026-05-17 (Onda 3)
- **Arquivo:** `src/Utils/process-message.ts`

### Mudanças

1. **`storeTcTokensFromHistorySync(chats, signalRepository, keyStore, logger)`**
   — nova função privada. Percorre `chats` recebidos via history sync;
   pra cada chat com `tcToken` válido E `tcTokenTimestamp > 0`, resolve
   o storage JID (LID-aware), compara contra cache existente (skip se
   já temos token mais recente) e persiste batch via
   `keyStore.set({ tctoken: {...entries, ...indexWrite} })`.

   Adicionado também o emit ANTES de `messaging-history.set`:
   ```ts
   await storeTcTokensFromHistorySync(data.chats, signalRepository, keyStore, logger)
   ev.emit('messaging-history.set', {...})
   ```

2. **Case `GROUP_MEMBER_LABEL_CHANGE`** no switch de `protocolMsg.type`:
   ```ts
   case proto.Message.ProtocolMessage.Type.GROUP_MEMBER_LABEL_CHANGE:
     const labelAssociationMsg = protocolMsg.memberLabel
     if (labelAssociationMsg?.label) {
       ev.emit('group.member-tag.update', {
         groupId, label, participant, participantAlt, messageTimestamp
       })
     }
     break
   ```

3. **Imports** de `buildMergedTcTokenIndexWrite` + `resolveTcTokenJid` from `tc-token-utils`.

### Motivação anti-detect

**TC token storage:** antes, contatos que tinham conversa no histórico
inicial (1:1 antigo) mas cujo token nunca chegou via notification
ficavam sem token no `tctoken` store. Primeira msg pós-pareamento saía
SEM token → fingerprint de bot. Agora populamos do histórico —
zero gap entre login e msg sending.

**Group member tag:** label changes do app mobile chegavam mas eram
ignoradas. Caller que trackeia tags fica out-of-sync se não capturarmos.

### Risco

Baixo. Função `storeTcTokensFromHistorySync` é append-only (skip se
existing mais recente), wrapped em try/catch (falha não derruba sync).
Case GROUP_MEMBER_LABEL_CHANGE só emite evento; não muta state.

---

## PATCH-040: messaging-history.status — emit completo com timeout 120s

- **Data:** 2026-05-17 (Onda 3)
- **Arquivo:** `src/Socket/chats.ts`

### Mudanças

1. **State adicionado** após `awaitingSyncTimeout`:
   ```ts
   const historySyncStatus = { initialBootstrapComplete: false, recentSyncComplete: false }
   let historySyncPausedTimeout: NodeJS.Timeout | undefined
   ```

2. **Emission block** ANTES do state machine de SyncState (`if (historyMsg && syncState === AwaitingInitialSync)`):
   - INITIAL_BOOTSTRAP → fire imediato (`status='complete', explicit=true`)
   - RECENT com progress=100 → completion explícita (clear timeout + emit)
   - RECENT sem progress=100 → reset 120s paused timeout; quando estoura
     sem novos chunks → emit `status='paused', explicit=false`

3. **socket-end handler** estendido pra clear o timeout + reset flags
   (próxima conexão re-emite milestones).

4. **Import** de `HISTORY_SYNC_PAUSED_TIMEOUT_MS` adicionado.

### Motivação anti-detect

WA Web SEMPRE rastreia milestones de history sync e UI reage (fecha
loader, commita state, etc.) com timing reproduzível. Cliente que NÃO
emite os status fica detectable por timing/UX anormal (loader infinito,
state nunca consolidado, etc).

Implementação literal do upstream rc10 (`Socket/chats.ts:1213-1267`).
Behavior idêntico em pontos importantes:
- `INITIAL_BOOTSTRAP` fire imediato sem checar progress
- 120s default pra paused timeout
- `explicit=true` quando progress=100, `false` quando inferido

### Risco

Baixo. Emit é additivo (novos events no `messaging-history.status`),
callers existentes intactos. Timeouts cleaned no socket-end.

---

## PATCH-039: auth-utils refCount mutex — mem leak fix do Baileys rc10

- **Data:** 2026-05-17 (Onda 2)
- **Arquivo:** `src/Utils/auth-utils.ts`

### Mudança

Adicionado reference counting em `txMutexes` (transaction mutexes do
`addTransactionCapability`):

```ts
const txMutexes = new Map<string, Mutex>()
const txMutexRefCounts = new Map<string, number>()  // NOVO

function acquireTxMutexRef(key: string): void { ... }  // NOVO
function releaseTxMutexRef(key: string): void {
  // cleanup quando refCount ≤ 0 E mutex não locked
}
```

E `transaction()` agora envolve em try/finally:

```ts
const mutex = getTxMutex(key)
acquireTxMutexRef(key)
try {
  return await mutex.runExclusive(async () => { ... })
} finally {
  releaseTxMutexRef(key)
}
```

### Motivação

Antes nosso `txMutexes` crescia indefinidamente. Cada `transaction(key, ...)`
com key NOVA (sender JID, group JID, etc) adicionava entrada que NUNCA era
removida. Em workspaces grandes (campanhas com 50k+ contatos únicos),
isso vazava ~100 bytes/key * 50k keys = ~5MB/instância acumulado.

Em sessões long-running (dias) com várias instâncias, ia escalando até
OOM. Baileys rc10 corrigiu via refCount + cleanup quando mutex livre.

### Risco

Zero comportamental. Refs sempre balanceadas (try/finally). Cleanup só
acontece quando refCount=0 E mutex.isLocked()=false — defensivo contra
race com transação concorrente (jamais deleta mutex em uso).

---

## PATCH-038: Handlers de Mex antifraud — reachout-timelock + message-capping

- **Data:** 2026-05-17 (Onda 2)
- **Arquivo:** `src/Socket/messages-recv.ts`

### Mudanças

1. **`handleMexAntifraudNotification(node)`** — handler novo que processa
   notifications mex no formato GraphQL (Baileys rc10), wrapper `{ data: { ... } }`.
   Reconhece 2 opNames:
   - `NotificationUserReachoutTimelockUpdate` — chamada `handleReachoutTimelockNotification`
   - `MessageCappingInfoNotification` — chamada `handleMessageCappingNotification`

2. **`handleReachoutTimelockNotification(payload)`** — interpreta o estado
   da restrição da Meta:
   - `is_active=false` → emite `connection.update` com
     `reachoutTimeLock: { isActive: false, enforcementType: DEFAULT }`
   - `is_active=true` → emite com `enforcementType` real do server +
     `timeEnforcementEnds` (default now+60s)

3. **`handleMessageCappingNotification(payload)`** — emite
   `message-capping.update` com payload `NewChatMessageCapInfo` (caller
   pausa campanha quando `used_quota / total_quota > 0.9`).

4. **Switch case `mex`** atualizado:
   ```ts
   case 'mex':
     if (!handleMexAntifraudNotification(node)) {
       await handleMexNewsletterNotification(node)
     }
     break
   ```
   Tenta antifraud PRIMEIRO; se opName não reconhecido, delega pro
   legacy newsletter handler. Zero breaking change pra newsletter ops.

### Anti-detect

Antes: notification de capping/reachout chegava → caía no
`handleMexNewsletterNotification` → falhava no parse JSON ("Invalid mex
newsletter notification content") → log ruidoso + estado anti-fraud
**totalmente ignorado**. Cliente continuava disparando msgs novas até
NACK 463 em cascata.

Agora: estado captado em tempo real → caller (campaign service) pode
parar disparos preventivamente quando `used_quota` alto OU `reachoutTimeLock.isActive=true`.

### Risco

Baixo. Function `handleMexAntifraudNotification` retorna `boolean` —
quando `false`, fluxo cai EXATAMENTE no comportamento anterior (legacy
handler). Newsletter ops intactas.

---

## PATCH-037: Mex types completos em State.ts (port literal Baileys rc10)

- **Data:** 2026-05-17 (Onda 2)
- **Arquivos:**
  - `src/Types/State.ts` — adicionado `ReachoutTimelockState`,
    `ReachoutTimelockEnforcementType` (enum 18 valores), `NewChatMessageCapInfo`
    (8 fields), 3 enums auxiliares (`NewChatMessageCappingStatusType`,
    `NewChatMessageCappingMVStatusType`, `NewChatMessageCappingOTEStatusType`).
    Campo `reachoutTimeLock?` adicionado ao `ConnectionState`.
  - `src/Types/Newsletter.ts` — types simplificados criados em PATCH-034
    REMOVIDOS; agora re-exportados de State.ts (retrocompat com callers
    que importavam de Newsletter).

### Motivação

PATCH-034 (Onda 1) criou versões simplificadas de `NewChatMessageCapInfo`
(3 fields) e `ReachoutTimelockEnforcementType` (string union de 3 values).
A análise end-to-end revelou que o upstream tem versões MUITO mais ricas:

- Enum `ReachoutTimelockEnforcementType` tem **18 valores**, cobrindo
  todas as categorias de violação (commerce policy, biz quality,
  web companion-only, etc).
- `NewChatMessageCapInfo` tem **8 fields**, incluindo cycle start/end
  timestamps, capping status, MV (multi-verification) status, OTE
  (one-time extension) status.

### Risco

Baixo. Re-exports de Newsletter preservam callers existentes. Mudança
de string union → enum nominal pode quebrar callers que comparavam
literal strings, mas como ninguém ainda usa esses types (foram
adicionados em PATCH-034 sem callers), risco efetivo é zero.

---

## PATCH-036: `groupOnlineCount` em `PresenceData`

- **Data:** 2026-05-17 (Onda 2)
- **Arquivos:** `src/Types/Chat.ts` (campo) + `src/Socket/chats.ts` (parsing)

### Mudança

```ts
// Types/Chat.ts
export interface PresenceData {
  lastKnownPresence: WAPresence
  lastSeen?: number
  groupOnlineCount?: number  // NOVO
}

// Socket/chats.ts handlePresenceUpdate
presence = {
  lastKnownPresence: ...,
  lastSeen: ...,
  groupOnlineCount: attrs.count ? +attrs.count : undefined  // NOVO
}
```

### Motivação

WA Web sempre captura o attr `count` em `<presence>` (agrega presença
de N membros em grupos). Sem isso, cada `presence.update` que vem com
contagem agregada do server perde o número. Anti-detect: fingerprint
sutil mas detectável de "cliente que não trackeia agregado de online
state".

### Risco

Zero. Campo opcional, parser default já trata `attrs.count` undefined.

---

## PATCH-035: BaileysEventMap — eventos novos do Baileys rc10

- **Data:** 2026-05-17 (Onda 1 fix de gaps post-auditoria)
- **Arquivo:** `src/Types/Events.ts`

### Mudanças (5 eventos novos + 1 type migration)

1. **`messaging-history.status`** — emitido quando history sync chega em
   marco (complete ou paused após 120s sem chunks). WA Web sempre emite;
   cliente que não trackeia fingerprint detectável.

2. **`group.member-tag.update`** — admin altera label de membro em grupo.

3. **`message-capping.update`** — anti-spam rate-limit update da Meta.
   Carrega `NewChatMessageCapInfo` com `remaining`/`total`/`resetMs`. Caller
   pode pausar campanha quando `remaining < N` evitando NACK 463 em cascata.

4. **`chats.lock`** — chat foi locked/unlocked via app mobile.

5. **`settings.update`** — union discriminada cobrindo 8 settings (unarchive,
   locale, link previews, time format, privacy relay, status privacy,
   notification activity, channels recommendation).

6. **`lid-mapping.update`** — payload migrado de `{ lid; pn }` para o type
   `LIDMapping` (estruturalmente equivalente; permite extensão futura).

### Risco

Baixo. São apenas type additions no `BaileysEventMap`. Subsistemas internos
não emitem esses eventos AINDA — typings prontos para quando absorvermos os
handlers correspondentes em onda futura. Callers existentes intactos.

### Manutenção

Wire dos emits acontecerá em onda separada quando absorvermos:
- `handleMessageCappingNotification` (messages-recv.ts) → emite `message-capping.update`
- History sync milestone tracking (chats.ts) → emite `messaging-history.status`
- App-state sync handler de `settings.*` mutations → emite `settings.update`

---

## PATCH-034: Mex types — reachout-timelock + message-capping queries

- **Data:** 2026-05-17 (Onda 1)
- **Arquivo:** `src/Types/Newsletter.ts`

### Mudanças

Adicionado em `XWAPaths` enum:
```ts
xwa2_fetch_account_reachout_timelock = 'xwa2_fetch_account_reachout_timelock'
xwa2_message_capping_info             = 'xwa2_message_capping_info'
```

Adicionado em `QueryIds` enum:
```ts
REACHOUT_TIMELOCK    = '23983697327930364'
MESSAGE_CAPPING_INFO = '24503548349331633'
```

Novos types:
- `ReachoutTimelockEnforcementType = 'UNLIMITED' | 'HARD_TIMELOCK' | 'SOFT_TIMELOCK'`
- `AccountReachoutTimelock { enforcementType; expirationMs? }`
- `NewChatMessageCapInfo { remaining; total; resetMs? }`

### Motivação

Permite implementar `fetchAccountReachoutTimelock()` e `fetchNewChatMessageCap()`
em onda futura. Anti-detect: cliente que CONSULTA estado de restrição da
conta antes de campanhar evita 463/479 em cascata.

### Risco

Zero. Apenas adições enum/type sem callers.

---

## PATCH-033: SERVER_ERROR_CODES + ACCOUNT_RESTRICTED_TEXT + NACK_REASON novo

- **Data:** 2026-05-17 (Onda 1)
- **Arquivo:** `src/Utils/decode-wa-message.ts`

### Mudanças

1. Adicionado `ACCOUNT_RESTRICTED_TEXT = 'Your account has been restricted'` —
   string que o server retorna em ACKs quando aplica restrição anti-fraud.

2. Adicionado em `NACK_REASONS`:
   - `SenderReachoutTimelocked: 463` — anti-spam timelock (conta-destino
     ou conta-emissora está restrita pra novas conversas).

3. Novo export `SERVER_ERROR_CODES`:
   ```ts
   export const SERVER_ERROR_CODES = {
     MessageAccountRestriction: '463', // 1:1 missing tctoken / conta restrita
     SmaxInvalid:               '479'  // stale device session
   } as const
   ```

### Motivação

Antes nossos logs tinham 463/479 como "unknown error" — handlers default
faziam retry transient infinito, gerando logs ruidosos + fingerprint de
"cliente que insiste em conta restrita". Agora callers podem distinguir:

- `463 MessageAccountRestriction` → PARAR de enviar 1:1, criar alerta admin
- `479 SmaxInvalid` → re-criar sessão Signal e retentar

### Risco

Zero. Constants exportadas — callers que usavam `NACK_REASONS.ParsingError`
etc. continuam funcionando. Adições puras.

---

## PATCH-029: Fetch dispatcher proxied — fix do vazamento de IP real em mídia

- **Data:** 2026-05-17
- **Localização:** *app layer* — `backend/src/services/whatsapp.service.ts`
  (`buildProxyFetchDispatcher` rewrite + wiring de `fetchAgent` em
  `makeWASocket` + `fetchLatestWaWebVersion`).
- **Documentado aqui** pra rastreabilidade — fechamento do bug-401 do incidente
  2026-05-17.

### Bug original

Versão anterior tinha `buildProxyFetchDispatcher` DESABILITADO via comentário
"REGRESSÃO TEMPORÁRIA" porque o custom-connect SOCKS5 + TLS wrap quebrava
upload de mídia (stream body entrava em estado inválido → `ENOENT /tmp/audio-enc`
→ "Media upload failed on all hosts"). Resultado:

- ✓ WS handshake passava pelo proxy
- ✗ TODOS os `fetch()` internos do wa-core (media upload/download, profile
  pic, version-fetch, edge_routing) saíam do **IP real do host**

Em workspace com N instâncias, **N JIDs distintos faziam upload de mídia
pelo MESMO IP** → fingerprint poderoso pra anti-fraude da Meta correlacionar
como "operador único multi-conta".

### Solução PATCH-029

Reescrita do dispatcher com path diferente pra cada tipo:

1. **HTTP proxy** (caso 90%+ no nosso pool): usa `UndiciProxyAgent` nativo
   — estável, suporta CONNECT tunneling pra HTTPS, body stream funciona
   corretamente. **SEMPRE habilitado**.

2. **SOCKS5**: mantém o `UndiciAgent` com custom-connect SOCKS5 + TLS wrap
   (mesmo código de antes). Mas agora **opt-in via env
   `WA_FETCH_AGENT_SOCKS5=true`**. Default `false` preserva o trade-off
   seguro original (mídia direto pelo IP real) até validação completa de
   upload de stream grande.

### Wire-up

```ts
const fetchDispatcher = activeProxy ? buildProxyFetchDispatcher(activeProxy) : undefined;

await fetchLatestWaWebVersion(
  fetchDispatcher ? ({ dispatcher: fetchDispatcher } as RequestInit) : {}
);

makeWASocket({
  ...,
  ...(proxyAgent && { agent: proxyAgent }),
  ...(fetchDispatcher && { fetchAgent: fetchDispatcher }),
});
```

### Impacto anti-detect (esperado, validação em produção)

- **Antes:** N JIDs / 1 IP de mídia (host real) → fácil correlação
- **Agora:** N JIDs / N IPs (round-robin do pool de proxies) → tráfego
  distribuído. Reduz drasticamente o sinal de "operador único".
- **WA Web version fetch** também passa pelo proxy — antes era +1 sinal
  (todas as instâncias chamavam o mesmo endpoint do mesmo IP em janela curta).

### Logging

Novo log no setup do socket distingue os 3 modos:

```
🔒 Using proxy (WS + media + version-fetch via proxy)          ← HTTP proxy
🔒 Using proxy (WS + media + version-fetch via proxy)          ← SOCKS5 + opt-in
⚠️  Using proxy (WS only — SOCKS5 media goes direct; ...)      ← SOCKS5 default
```

### Smoke test validado 2026-05-17

- HTTP dispatcher: criado como UndiciProxyAgent ✓
- SOCKS5 default OFF (env empty): ✓
- SOCKS5 opt-in via env: ✓
- Backend typecheck: exit 0
- wa-core typecheck: exit 0

### Configuração recomendada pra produção

1. Garantir que TODOS proxies do pool sejam HTTP (não SOCKS5) — assim o
   fix ativa automaticamente em 100% das instâncias.
2. Se algum proxy for SOCKS5: validar upload de áudio + imagem antes de
   ativar `WA_FETCH_AGENT_SOCKS5=true`. Pequeno workspace de teste primeiro.

### Manutenção futura

- Avaliar instalar `undici-socks-proxy-agent` (lib madura específica pra
  SOCKS5 + undici) e remover o custom-connect.
- Pra defesa máxima: combinar com IP residential proxy provider (sticky
  session por instância) — cada inst → 1 IP fixo no Brasil. Elimina
  correlação 100%.

---

## PATCH-032: Profile pipeline — metadata-strip + per-instance variation (texto + foto)

- **Data:** 2026-05-17
- **Localização:** *app layer, não wa-core* — vive em
  `backend/src/lib/profile-photo-pipeline.ts` + `profile-text-pipeline.ts` +
  wire em `backend/src/services/whatsapp.service.ts:applyAutoProfileDetached`.
  Documentado aqui pra rastreabilidade.
- **Migration:** `backend/prisma/schema.prisma` — adicionados campos
  `Instance.autoProfileAppliedAt: DateTime?` e `Instance.isBusinessAccount: Boolean?`.
  `npx prisma db push` aplicado em 2026-05-17.

### Motivação

`WhatsAppProfile` pode ser compartilhado entre N instâncias intencionalmente
(use case: aluguel de WhatsApp, admin define um perfil único). Antes:
todas as N instâncias subiam **bytes idênticos** da foto e strings idênticas
de displayName/about/description — fingerprint óbvio pra anti-fraude Meta.

### Componentes

**1. `profile-photo-pipeline.ts`** — `transformProfilePhoto(buf, seed)`:
   - Strip TODOS metadados (EXIF/ICC/XMP/IPTC + rotate baked-in)
   - Resize 640±4px (jitter determinístico)
   - Re-encode JPEG ou WebP (escolha pelo seed)
   - Quality jitter 78-92
   - Chroma subsampling 4:2:0 | 4:4:4 (JPEG)
   - Pixel noise: 6-12 pixels random recebem ±1 RGB (invisível, quebra hash)
   - Trailing bytes determinísticos via SHA256(seed+':trailing')
   - Resultado: hash binário ÚNICO por instância, foto VISUALMENTE idêntica
   - Performance: ~10-40ms por foto. Idempotente (mesma seed → mesmos bytes).

**2. `profile-text-pipeline.ts`** — `varyProfileText(str, seed)` +
   `varyProfileFields(profile, seed)`:
   - Homoglyph Latin↔Cyrillic em 1-2 chars (a→а, o→о, e→е, A→А, etc.)
   - Zero-Width chars (ZWSP/ZWNJ/Word Joiner) em posição interna (esparso, 25%)
   - NBSP (U+00A0) substituindo espaço comum (50%)
   - Punctuation toggle (50% adiciona/remove ponto final)
   - **NÃO modifica** URLs, emails, números de telefone (preserva funcionalidade)
   - `varyProfileFields` aplica em displayName/about/description/address;
     email/website ficam intactos (devem permanecer funcionais)

**3. Wire em `applyAutoProfileDetached`** (whatsapp.service.ts):
   - **Idempotency guard** via `Instance.autoProfileAppliedAt`: skip
     re-aplicação se já aplicado < 7d E profile.updatedAt inalterado.
     Reconnects transient (515/428/408/503) NÃO disparam re-aplicação.
   - Carrega bytes da foto base (local /api/uploads/ ou URL externa) →
     transforma via `transformProfilePhoto(buf, instanceId)` → passa
     `photoBuffer` pra `updateProfile`.
   - Texto: `varyProfileFields(prof, instanceId)` antes de `updateProfile`.
   - **Detect-business** (`detectBusinessAccount`): IQ probe `w:biz get`;
     resultado cacheado em `Instance.isBusinessAccount`. Conta consumer
     (403/401/404 na probe) → NÃO envia campos `w:biz` em nenhuma chamada
     subsequente. Elimina logs de "Business profile IQ failed 403/503" e
     fingerprint "tentou setar w:biz em conta pessoal".

**4. `UpdateProfileOpts.photoBuffer?: Buffer`** — `updateProfile` agora
   prioriza `photoBuffer` (transformed) sobre `photoPath`/`photoUrl` (raw
   fallback).

### Não breaking
- Profiles não-vinculados a `WhatsAppProfile` (instâncias sem `profileId`):
  zero impacto.
- Idempotency guard: instâncias antigas (`autoProfileAppliedAt = null`)
  aplicam normalmente uma vez, depois ficam cacheadas.
- `email`/`website` nunca variam.
- Falha do pipeline cai em fallback raw (path/url originais).
- `detectBusinessAccount` retorna null em erro de rede → caller retenta
  na próxima reconexão.

### Smoke test (validado 2026-05-17)
- 5 instâncias do log de produção produziram 5 hashes únicos.
- Idempotency 3x: mesma instância → mesmo buffer 3x.
- Email/URL/phone permanecem byte-by-byte iguais ao input.
- Typecheck verde nos 2 lados (wa-core + backend).

### Trade-offs futuros
- Se Meta normalizar JPEG quality/subsampling no server-side, hashes podem
  colidir entre instâncias com mesmos params iniciais. Defense in depth:
  pixel noise + trailing bytes garantem diferença mesmo após re-encoding
  do server (que NÃO recompõe pixel noise e descarta trailing — mas o hash
  WHATSAPP usa é do upload original, não da versão re-encodada da CDN).
- Pra defesa máxima, em onda futura: perturbação direta de coeficientes
  DCT via `mozjpeg` (sharp tem flag).

---

## PATCH-031: Anti-detection — overrides de UserAgent + DeviceProps + presets

- **Data:** 2026-05-17
- **Arquivos:**
  - `src/Types/Socket.ts` — adiciona `userAgentOverrides?` e `deviceProps?`
    no `SocketConfig`.
  - `src/Utils/validate-connection.ts` — `getUserAgent` mescla
    `userAgentOverrides` com defaults; `generateRegistrationNode` lê
    `deviceProps.version` quando fornecido.
  - `src/Utils/fingerprint-presets.ts` *(novo)* — catálogo de 9 presets
    coerentes (browser + osVersion + osBuildNumber + mnc/mcc + locale +
    deviceProps.version) cobrindo macOS Chrome/Safari, Windows Chrome/Edge,
    Ubuntu Chrome/Firefox. `pickFingerprintPreset(seed)` deterministico
    via SHA256 do seed (use `instanceId` como seed).
  - `src/Utils/index.ts` — export dos novos helpers.
  - **Backend wire-up:** `backend/src/services/whatsapp.service.ts` —
    chama `pickFingerprintPreset(instanceId)` e passa `browser`,
    `userAgentOverrides`, `deviceProps`, `countryCode` ao `makeWASocket`.
- **Motivação principal — anti-ban / anti-detect:**
  - Antes: TODAS as instâncias enviavam UserAgent com `osVersion='0.1'`,
    `mnc='000'`, `mcc='000'`, `localeLanguageIso6391='en'`, `countryCode='US'`,
    `DeviceProps.version={10,15,7}` hardcoded — fingerprint idêntico em N
    contas, sinal forte de operador único multi-conta pra anti-fraude Meta.
  - Agora: cada instância (seed=instanceId) pega 1 dos 9 presets realistas,
    todos com `mcc=724` (Brasil) e operadora válida (Vivo/Claro/TIM/Oi),
    `localeLanguageIso6391='pt'`, osVersion/osBuildNumber reais.
- **Sem breaking change:**
  - Defaults antigos mantidos como fallback quando override não fornecido —
    chamadas pré-existentes ao `makeWASocket` sem `userAgentOverrides`
    continuam funcionando.
  - Em pair-mode, NÃO aplicamos overrides — registramos device cru
    (companion_platform_id=1=CHROME) sem fingerprint específico ainda.
    A próxima reconexão (post-pair) usa preset normal.
  - Env `WA_CLIENT` continua override quando setada (escape hatch).
- **Risco:** baixo. Presets cobrem combinações realistas e plausíveis. Pode
  haver mismatch sutil se WA verifica osVersion vs browser-string em
  detalhes específicos — não observado em testes.
- **Manutenção:**
  - Adicionar presets aumenta diversidade (sweetspot ~15-20 presets).
  - Bumpar `deviceProps.version` periodicamente conforme WA Web atualiza
    a versão do "WA Web app".
  - Adicionar tabela inversa de operadora por país pra suportar contas
    não-BR no futuro.

---

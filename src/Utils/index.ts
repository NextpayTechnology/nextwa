export * from './generics'
export * from './decode-wa-message'
export * from './messages'
export * from './messages-media'
export * from './validate-connection'
export * from './crypto'
export * from './signal'
export * from './noise-handler'
export * from './history'
export * from './chat-utils'
export * from './lt-hash'
export * from './auth-utils'
export * from './use-multi-file-auth-state'
export * from './link-preview'
export * from './event-buffer'
export * from './process-message'
export * from './message-retry-manager'
export * from './browser-utils'
// [PATCH-005] Reporting token utilities — required pro WhatsApp aceitar entrega
// de mensagens ricas (buttons/list/template/interactive). Portado do whaileys.
export * from './reporting-utils'
// [PATCH-009] tc-token (TrustedContact) sync — port direto do Baileys master
// (commit 402f479). Reduz fingerprint de bot via emissão semanal do nosso
// token pro contato + attach do token vigente em cada send 1:1.
export * from './tc-token-utils'
// [PATCH-013] identity-change unificado — port literal do master. Discriminated
// union pra distinguir 8 estados (companion device, self-primary, debounced,
// offline, sem-sessão, refresh OK, falha). Suporta hook `onBeforeSessionRefresh`
// usado pra reissue de tc-token na ordem certa.
export * from './identity-change'
// [PATCH-024] ServerClock — track skew via <success t=...>. Port do zapo
// (vinikjkkj/zapo). Tokens e timestamps usam server-aligned time pra
// reduzir fingerprint de drift de relógio host.
export * from './server-clock'
// [PATCH-025] CS Token (Client-Server) fallback quando não há TC token
// vigente. Port do zapo. Reduz fingerprint de bot — WA Web sempre manda
// CS OU TC, nunca nada.
export * from './cs-token-utils'
// [PATCH-026] cherry-pick Baileys rc10 — builder de stanza ACK (function pura)
// que mirrors WA Web's sendAck/sendNack. Centraliza o padrão de ACK pra que
// receivers consistentes evitem fingerprint subtil de bot na shape do ACK.
export * from './stanza-ack'
// [PATCH-027] cherry-pick Baileys rc10 — offline node processor com batch
// + yield to event loop. Evita bloquear o loop em rajadas de offline,
// preservando keepalive WS e adicionando latência humana realista.
export * from './offline-node-processor'
// [PATCH-028] cherry-pick Baileys rc10 — processContactAction pure-function
// pra extrair LID↔PN mapping de contactAction (app-state sync). Completa
// a cobertura de LID mappings que antes vinha só de historySync e receipts.
export * from './sync-action-utils'
// [PATCH-031] Anti-detection — presets coerentes de browser + userAgent +
// deviceProps, sorteados por hash determinístico do instanceId. Reduz
// correlação cruzada entre instâncias do mesmo workspace.
export * from './fingerprint-presets'
// [PATCH-044] cherry-pick Baileys rc10 — companion device QR pairing helpers
// (futuro device-linking). Port literal do upstream.
export * from './companion-reg-client-utils'

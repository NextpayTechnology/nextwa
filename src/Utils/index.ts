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

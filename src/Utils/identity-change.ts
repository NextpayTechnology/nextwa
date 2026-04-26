/**
 * [PATCH-013] Identity-change handler — port direto de Baileys master
 * (`Utils/identity-change.ts`, sem mudanças semânticas).
 *
 * Por que existe (vs. nosso fluxo antigo):
 *   Antes detectávamos `<identity>` no `handleEncryptNotification` e só fazíamos
 *   `assertSessions(force=true)` — sem distinguir companion device, self-primary,
 *   notification offline, ou se já tínhamos sessão prévia. Resultado: em alguns
 *   cenários (companion device do próprio peer trocou) reescrevíamos sessão à toa,
 *   gerando `<receipt type=retry>` desnecessários e pingando server-side check.
 *
 *   Master quebrou isso em 8 estados explícitos (discriminated union via `action`)
 *   e adicionou hook `onBeforeSessionRefresh` pra disparar reissue de tc-token
 *   ANTES da sessão ser refrescada — mantém ordem de operações idêntica ao WA Web.
 *
 * Nota de paridade: este arquivo é literal — qualquer divergência aqui é bug.
 */
import type NodeCache from '@cacheable/node-cache'
import { areJidsSameUser, type BinaryNode, getBinaryNodeChild, jidDecode } from '../WABinary'
import type { ILogger } from './logger'

const isStringNullOrEmpty = (s: string | undefined | null): boolean => !s || s.length === 0

export type IdentityChangeResult =
	| { action: 'no_identity_node' }
	| { action: 'invalid_notification' }
	| { action: 'skipped_companion_device'; device: number }
	| { action: 'skipped_self_primary' }
	| { action: 'debounced' }
	| { action: 'skipped_offline' }
	| { action: 'skipped_no_session' }
	| { action: 'session_refreshed' }
	| { action: 'session_refresh_failed'; error: unknown }

export type IdentityChangeContext = {
	meId: string | undefined
	meLid: string | undefined
	validateSession: (jid: string) => Promise<{ exists: boolean; reason?: string }>
	assertSessions: (jids: string[], force?: boolean) => Promise<boolean>
	debounceCache: NodeCache<boolean>
	logger: ILogger
	/**
	 * Invocado *antes* do `assertSessions` quando há sessão preexistente.
	 * Use pra side-effects fire-and-forget (ex.: tctoken re-issuance) na mesma
	 * ordem do WA Web (antes do refresh E2E). Não pode lançar — handlers próprios
	 * são responsáveis pelo error handling.
	 */
	onBeforeSessionRefresh?: (jid: string) => void
}

export async function handleIdentityChange(
	node: BinaryNode,
	ctx: IdentityChangeContext
): Promise<IdentityChangeResult> {
	const from = node.attrs.from
	if (!from) {
		return { action: 'invalid_notification' }
	}

	const identityNode = getBinaryNodeChild(node, 'identity')
	if (!identityNode) {
		return { action: 'no_identity_node' }
	}

	ctx.logger.info({ jid: from }, 'identity changed')

	const decoded = jidDecode(from)
	if (decoded?.device && decoded.device !== 0) {
		ctx.logger.debug({ jid: from, device: decoded.device }, 'ignoring identity change from companion device')
		return { action: 'skipped_companion_device', device: decoded.device }
	}

	const isSelfPrimary = ctx.meId && (areJidsSameUser(from, ctx.meId) || (ctx.meLid && areJidsSameUser(from, ctx.meLid)))
	if (isSelfPrimary) {
		ctx.logger.info({ jid: from }, 'self primary identity changed')
		return { action: 'skipped_self_primary' }
	}

	if (ctx.debounceCache.get(from)) {
		ctx.logger.debug({ jid: from }, 'skipping identity assert (debounced)')
		return { action: 'debounced' }
	}

	ctx.debounceCache.set(from, true)

	const isOfflineNotification = !isStringNullOrEmpty(node.attrs.offline)
	const hasExistingSession = await ctx.validateSession(from)

	if (!hasExistingSession.exists) {
		ctx.logger.debug({ jid: from }, 'no old session, skipping session refresh')
		return { action: 'skipped_no_session' }
	}

	ctx.logger.debug({ jid: from }, 'old session exists, will refresh session')

	if (isOfflineNotification) {
		ctx.logger.debug({ jid: from }, 'skipping session refresh during offline processing')
		return { action: 'skipped_offline' }
	}

	ctx.onBeforeSessionRefresh?.(from)

	try {
		await ctx.assertSessions([from], true)
		return { action: 'session_refreshed' }
	} catch (error) {
		ctx.logger.warn({ error, jid: from }, 'failed to assert sessions after identity change')
		return { action: 'session_refresh_failed', error }
	}
}

/**
 * [PATCH-028] cherry-pick Baileys master — sync-action-utils.
 *
 * Port direto de `Baileys-master/src/Utils/sync-action-utils.ts`. Implementa
 * pure-function processing de `contactAction` (parte do app-state-sync) e
 * emite eventos `contacts.upsert` + `lid-mapping.update`.
 *
 * MOTIVAÇÃO ANTI-DETECÇÃO + ROBUSTEZ:
 *   Nosso wa-core ainda extraía LID/PN mappings APENAS via historySync (PATCH-016)
 *   e via receipts (passive — só dispara quando alguém manda receipt). O Baileys
 *   master (rc10) adicionou EXTRAÇÃO via contactAction — quando o user atualiza
 *   o nome do contato no celular, a sync chega via app-state e CARREGA o par
 *   LID↔PN. Sem isso, perdemos mappings que WA Web SEMPRE captura.
 *
 *   Anti-fingerprint: WA Web sempre processa estes mappings — clientes que NÃO
 *   processam têm `lidMapping` store desproporcionalmente vazia, fácil de
 *   correlacionar como "cliente não-WhatsApp Web".
 *
 *   Sem efeito colateral: funções puras retornam descrição dos eventos; caller
 *   (chat-utils.ts no processSyncAction) decide emitir.
 *
 * Wiring: chamada pelo handler de `contactAction` em `chat-utils.ts` (Baileys
 * master). Pode ser wired num PATCH separado quando integrarmos app-state.
 */
import { proto } from '../../WAProto/index.js'
import type { BaileysEventEmitter, BaileysEventMap, Contact } from '../Types'
import { isLidUser, isPnUser } from '../WABinary'
import type { ILogger } from './logger'

export type ContactsUpsertResult = {
	event: 'contacts.upsert'
	data: Contact[]
}

export type LidMappingUpdateResult = {
	event: 'lid-mapping.update'
	data: BaileysEventMap['lid-mapping.update']
}

export type SyncActionResult = ContactsUpsertResult | LidMappingUpdateResult

/**
 * Process contactAction and return events to emit.
 * Pure function - no side effects.
 */
export const processContactAction = (
	action: proto.SyncActionValue.IContactAction,
	id: string | undefined,
	logger?: ILogger
): SyncActionResult[] => {
	const results: SyncActionResult[] = []

	if (!id) {
		logger?.warn(
			{ hasFullName: !!action.fullName, hasLidJid: !!action.lidJid, hasPnJid: !!action.pnJid },
			'contactAction sync: missing id in index'
		)
		return results
	}

	const lidJid = action.lidJid
	const idIsPn = isPnUser(id)
	// PN is in index[1], not in contactAction.pnJid which is usually null
	const phoneNumber = idIsPn ? id : action.pnJid || undefined

	// Always emit contacts.upsert
	results.push({
		event: 'contacts.upsert',
		data: [
			{
				id,
				name: action.fullName || action.firstName || action.username || undefined,
				username: action.username || undefined,
				lid: lidJid || undefined,
				phoneNumber
			}
		]
	})

	// Emit lid-mapping.update if we have valid LID-PN pair
	if (lidJid && isLidUser(lidJid) && idIsPn) {
		results.push({
			event: 'lid-mapping.update',
			data: { lid: lidJid, pn: id }
		})
	}

	return results
}

export const emitSyncActionResults = (ev: BaileysEventEmitter, results: SyncActionResult[]): void => {
	for (const result of results) {
		if (result.event === 'contacts.upsert') {
			ev.emit('contacts.upsert', result.data)
		} else {
			ev.emit('lid-mapping.update', result.data)
		}
	}
}

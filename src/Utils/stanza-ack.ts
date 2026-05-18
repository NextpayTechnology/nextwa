/**
 * [PATCH-026] cherry-pick Baileys master — proper ACK stanza builder.
 *
 * Port direto de `Baileys-master/src/Utils/stanza-ack.ts` (Baileys v7 rc10
 * — "proper ack handling"). Function pura sem I/O, mirrors WhatsApp Web's
 * ACK construction (WAWebHandleMsgSendAck.sendAck / sendNack +
 * WAWebCreateNackFromStanza.createNackFromStanza).
 *
 * POR QUE matters anti-detecção:
 *   Antes nossa lógica de ACK estava inline em messages-recv.ts, inconsistente
 *   entre tipos de stanza. WA Web sempre envia ACK com `from` em mensagens,
 *   sempre inclui `type` quando presente, sempre propaga `participant`/`recipient`.
 *   Diferenças sutis na shape do ACK são fingerprint forte de bot (WA tracking
 *   sabe exatamente como WA Web formata).
 *
 * Esta função consolida o padrão correto pra que receivers possam usar
 * `buildAckStanza(node, errCode?, meId?)` em qualquer caminho.
 */
import type { BinaryNode } from '../WABinary'

export function buildAckStanza(node: BinaryNode, errorCode?: number, meId?: string): BinaryNode {
	const { tag, attrs } = node
	const stanza: BinaryNode = {
		tag: 'ack',
		attrs: {
			id: attrs.id!,
			to: attrs.from!,
			class: tag
		}
	}

	if (errorCode) {
		stanza.attrs.error = errorCode.toString()
	}

	if (attrs.participant) {
		stanza.attrs.participant = attrs.participant
	}

	if (attrs.recipient) {
		stanza.attrs.recipient = attrs.recipient
	}

	// WA Web always includes type when present: `n.type || DROP_ATTR`
	if (attrs.type) {
		stanza.attrs.type = attrs.type
	}

	// WA Web WAWebHandleMsgSendAck.sendAck/sendNack always include `from` for message-class ACKs
	if (tag === 'message' && meId) {
		stanza.attrs.from = meId
	}

	return stanza
}

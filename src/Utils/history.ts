import { promisify } from 'util'
import { inflate } from 'zlib'
import { proto } from '../../WAProto/index.js'
import type { Chat, Contact, WAMessage } from '../Types'
import { WAMessageStubType } from '../Types'
import { isLidUser, isPnUser } from '../WABinary'
import { toNumber } from './generics'
import { normalizeMessageContent } from './messages'
import { downloadContentFromMessage } from './messages-media'

const inflatePromise = promisify(inflate)

export const downloadHistory = async (msg: proto.Message.IHistorySyncNotification, options: RequestInit) => {
	const stream = await downloadContentFromMessage(msg, 'md-msg-hist', { options })
	const bufferArray: Buffer[] = []
	for await (const chunk of stream) {
		bufferArray.push(chunk)
	}

	let buffer: Buffer = Buffer.concat(bufferArray)

	// decompress buffer
	buffer = await inflatePromise(buffer)

	const syncData = proto.HistorySync.decode(buffer)
	return syncData
}

// [PATCH-016] LID-PN pair shape pra que callers persistam em `lidMapping` store.
// Antes só populávamos via mensagens individuais (process-message LID_MIGRATION_MAPPING_SYNC),
// perdendo ~5% dos contatos com device migration recente cujos pares só vêm em
// `Conversation` no history sync. Aqui extraímos e devolvemos pro caller decidir.
export type LIDPNPair = { lid: string; pn: string }

export const processHistoryMessage = (item: proto.IHistorySync) => {
	const messages: WAMessage[] = []
	const contacts: Contact[] = []
	const chats: Chat[] = []
	// [PATCH-016] pares acumulados durante varredura de conversations
	const lidPnPairs: LIDPNPair[] = []

	switch (item.syncType) {
		case proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP:
		case proto.HistorySync.HistorySyncType.RECENT:
		case proto.HistorySync.HistorySyncType.FULL:
		case proto.HistorySync.HistorySyncType.ON_DEMAND:
			for (const chat of item.conversations! as Chat[]) {
				contacts.push({
					id: chat.id!,
					name: chat.name || undefined,
					lid: chat.lidJid || undefined,
					phoneNumber: chat.pnJid || undefined
				})

				// [PATCH-016] Extrai par LID↔PN quando ambos vêm na conversation.
				// Filtra por sufixo correto pra defender contra payloads malformados
				// (server às vezes manda jid bruto sem `@lid`/`@s.whatsapp.net`).
				if (chat.lidJid && chat.pnJid && isLidUser(chat.lidJid) && isPnUser(chat.pnJid)) {
					lidPnPairs.push({ lid: chat.lidJid, pn: chat.pnJid })
				}

				const msgs = chat.messages || []
				delete chat.messages

				for (const item of msgs) {
					const message = item.message! as WAMessage
					messages.push(message)

					if (!chat.messages?.length) {
						// keep only the most recent message in the chat array
						chat.messages = [{ message }]
					}

					if (!message.key.fromMe && !chat.lastMessageRecvTimestamp) {
						chat.lastMessageRecvTimestamp = toNumber(message.messageTimestamp)
					}

					if (
						(message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_BSP ||
							message.messageStubType === WAMessageStubType.BIZ_PRIVACY_MODE_TO_FB) &&
						message.messageStubParameters?.[0]
					) {
						contacts.push({
							id: message.key.participant || message.key.remoteJid!,
							verifiedName: message.messageStubParameters?.[0]
						})
					}
				}

				chats.push({ ...chat })
			}

			break
		case proto.HistorySync.HistorySyncType.PUSH_NAME:
			for (const c of item.pushnames!) {
				contacts.push({ id: c.id!, notify: c.pushname! })
			}

			break
	}

	return {
		chats,
		contacts,
		messages,
		// [PATCH-016] callers podem persistir esses pares em `signalRepository.lidMapping`
		// pra evitar primeira-campanha-pós-pareamento bater em LID errado.
		lidPnPairs,
		syncType: item.syncType,
		progress: item.progress
	}
}

export const downloadAndProcessHistorySyncNotification = async (
	msg: proto.Message.IHistorySyncNotification,
	options: RequestInit
) => {
	let historyMsg: proto.HistorySync
	if (msg.initialHistBootstrapInlinePayload) {
		historyMsg = proto.HistorySync.decode(await inflatePromise(msg.initialHistBootstrapInlinePayload))
	} else {
		historyMsg = await downloadHistory(msg, options)
	}

	return processHistoryMessage(historyMsg)
}

export const getHistoryMsg = (message: proto.IMessage) => {
	const normalizedContent = !!message ? normalizeMessageContent(message) : undefined
	const anyHistoryMsg = normalizedContent?.protocolMessage?.historySyncNotification!

	return anyHistoryMsg
}

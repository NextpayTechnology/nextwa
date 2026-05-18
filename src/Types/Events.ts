import type { Boom } from '@hapi/boom'
import { proto } from '../../WAProto/index.js'
import type { AuthenticationCreds, LIDMapping } from './Auth'
import type { WACallEvent } from './Call'
import type { Chat, ChatUpdate, PresenceData } from './Chat'
import type { Contact } from './Contact'
import type {
	GroupMetadata,
	GroupParticipant,
	ParticipantAction,
	RequestJoinAction,
	RequestJoinMethod
} from './GroupMetadata'
import type { Label } from './Label'
import type { LabelAssociation } from './LabelAssociation'
import type { MessageUpsertType, MessageUserReceiptUpdate, WAMessage, WAMessageKey, WAMessageUpdate } from './Message'
// [PATCH-035/037] cherry-pick Baileys rc10 — types pra novos eventos.
// NewChatMessageCapInfo agora vem de State.ts (shape completo).
import type { ConnectionState, NewChatMessageCapInfo } from './State'

// TODO: refactor this mess
export type BaileysEventMap = {
	/** connection state has been updated -- WS closed, opened, connecting etc. */
	'connection.update': Partial<ConnectionState>
	/** credentials updated -- some metadata, keys or something */
	'creds.update': Partial<AuthenticationCreds>
	/** set chats (history sync), everything is reverse chronologically sorted */
	'messaging-history.set': {
		chats: Chat[]
		contacts: Contact[]
		messages: WAMessage[]
		isLatest?: boolean
		progress?: number | null
		syncType?: proto.HistorySync.HistorySyncType | null
		peerDataRequestSessionId?: string | null
	}
	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — signals history sync milestones
	 * (completion or stall) per sync type. Caller pode usar pra fechar UI loaders
	 * com timeout natural (paused after 120s) ou commit final ('complete').
	 *
	 * Anti-detect: WA Web SEMPRE emite esses status — sem isso, fingerprint
	 * de "cliente que não trackeia history sync state" é detectável.
	 */
	'messaging-history.status': {
		/** which sync phase this status refers to */
		syncType: proto.HistorySync.HistorySyncType
		/** the status of this sync phase */
		status: 'complete' | 'paused'
		/**
		 * progress === 100 was received from the server.
		 * when false, completion was inferred via timeout (no more chunks arriving).
		 */
		explicit: boolean
	}
	/** upsert chats */
	'chats.upsert': Chat[]
	/** update the given chats */
	'chats.update': ChatUpdate[]
	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — payload migrado de `{ lid; pn }`
	 * para o type `LIDMapping`. Estruturalmente equivalente (LIDMapping
	 * em Types/Auth.ts é `{ lid: string; pn: string }`); typecast manual
	 * só é necessário pra callers que destruturam fields adicionais futuros.
	 */
	'lid-mapping.update': LIDMapping
	/** delete chats with given ID */
	'chats.delete': string[]
	/** presence of contact in a chat updated */
	'presence.update': { id: string; presences: { [participant: string]: PresenceData } }

	'contacts.upsert': Contact[]
	'contacts.update': Partial<Contact>[]

	'messages.delete': { keys: WAMessageKey[] } | { jid: string; all: true }
	'messages.update': WAMessageUpdate[]
	'messages.media-update': { key: WAMessageKey; media?: { ciphertext: Uint8Array; iv: Uint8Array }; error?: Boom }[]
	/**
	 * add/update the given messages. If they were received while the connection was online,
	 * the update will have type: "notify"
	 * if requestId is provided, then the messages was received from the phone due to it being unavailable
	 *  */
	'messages.upsert': { messages: WAMessage[]; type: MessageUpsertType; requestId?: string }
	/** message was reacted to. If reaction was removed -- then "reaction.text" will be falsey */
	'messages.reaction': { key: WAMessageKey; reaction: proto.IReaction }[]

	'message-receipt.update': MessageUserReceiptUpdate[]

	'groups.upsert': GroupMetadata[]
	'groups.update': Partial<GroupMetadata>[]
	/** apply an action to participants in a group */
	'group-participants.update': {
		id: string
		author: string
		authorPn?: string
		participants: GroupParticipant[]
		action: ParticipantAction
	}
	'group.join-request': {
		id: string
		author: string
		authorPn?: string
		participant: string
		participantPn?: string
		action: RequestJoinAction
		method: RequestJoinMethod
	}

	'blocklist.set': { blocklist: string[] }
	'blocklist.update': { blocklist: string[]; type: 'add' | 'remove' }

	/** Receive an update on a call, including when the call was received, rejected, accepted */
	call: WACallEvent[]
	'labels.edit': Label
	'labels.association': { association: LabelAssociation; type: 'add' | 'remove' }

	/** Newsletter-related events */
	'newsletter.reaction': {
		id: string
		server_id: string
		reaction: { code?: string; count?: number; removed?: boolean }
	}
	'newsletter.view': { id: string; server_id: string; count: number }
	'newsletter-participants.update': { id: string; author: string; user: string; new_role: string; action: string }
	'newsletter-settings.update': { id: string; update: any }

	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — update das labels de um
	 * participante em grupo. Disparado quando admin altera tag de membro
	 * via app mobile.
	 */
	'group.member-tag.update': {
		groupId: string
		participant: string
		participantAlt?: string
		label: string
		messageTimestamp?: number
	}

	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — update do estado de message
	 * capping (anti-spam rate-limit aplicado pela Meta). Quando WA percebe
	 * que a conta está enviando muitas mensagens novas, envia este update
	 * com info de quanto restou da janela.
	 *
	 * Anti-detect: caller pode pausar campanhas quando `remaining < N` em
	 * vez de continuar disparando e tomar NACK 463 em cascata.
	 */
	'message-capping.update': NewChatMessageCapInfo

	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — chat foi locked/unlocked
	 * (proteção por código no app mobile). Caller pode esconder UI quando
	 * locked=true.
	 */
	'chats.lock': { id: string; locked: boolean }

	/**
	 * [PATCH-035] cherry-pick Baileys rc10 — settings sync events (mudanças
	 * em prefs do app mobile como locale, time format, privacy). Union
	 * discriminada simples — caller faz switch em `setting`.
	 *
	 * Type signatures dos `value` referenciam protos via `any` pra evitar
	 * dependência circular com WAProto. Caller pode cast pra type específico
	 * conforme o setting.
	 */
	'settings.update':
		| { setting: 'unarchiveChats'; value: boolean }
		| { setting: 'locale'; value: string }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'disableLinkPreviews'; value: any }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'timeFormat'; value: any }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'privacySettingRelayAllCalls'; value: any }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'statusPrivacy'; value: any }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'notificationActivitySetting'; value: any }
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		| { setting: 'channelsPersonalisedRecommendation'; value: any }
}

export type BufferedEventData = {
	historySets: {
		chats: { [jid: string]: Chat }
		contacts: { [jid: string]: Contact }
		messages: { [uqId: string]: WAMessage }
		empty: boolean
		isLatest: boolean
		progress?: number | null
		syncType?: proto.HistorySync.HistorySyncType
		peerDataRequestSessionId?: string
	}
	chatUpserts: { [jid: string]: Chat }
	chatUpdates: { [jid: string]: ChatUpdate }
	chatDeletes: Set<string>
	contactUpserts: { [jid: string]: Contact }
	contactUpdates: { [jid: string]: Partial<Contact> }
	messageUpserts: { [key: string]: { type: MessageUpsertType; message: WAMessage } }
	messageUpdates: { [key: string]: WAMessageUpdate }
	messageDeletes: { [key: string]: WAMessageKey }
	messageReactions: { [key: string]: { key: WAMessageKey; reactions: proto.IReaction[] } }
	messageReceipts: { [key: string]: { key: WAMessageKey; userReceipt: proto.IUserReceipt[] } }
	groupUpdates: { [jid: string]: Partial<GroupMetadata> }
}

export type BaileysEvent = keyof BaileysEventMap

export interface BaileysEventEmitter {
	on<T extends keyof BaileysEventMap>(event: T, listener: (arg: BaileysEventMap[T]) => void): void
	off<T extends keyof BaileysEventMap>(event: T, listener: (arg: BaileysEventMap[T]) => void): void
	removeAllListeners<T extends keyof BaileysEventMap>(event: T): void
	emit<T extends keyof BaileysEventMap>(event: T, arg: BaileysEventMap[T]): boolean
}

import { Boom } from '@hapi/boom'
import type { Contact } from './Contact'

export enum SyncState {
	/** The socket is connecting, but we haven't received pending notifications yet. */
	Connecting,
	/** Pending notifications received. Buffering events until we decide whether to sync or not. */
	AwaitingInitialSync,
	/** The initial app state sync (history, etc.) is in progress. Buffering continues. */
	Syncing,
	/** Initial sync is complete, or was skipped. The socket is fully operational and events are processed in real-time. */
	Online
}

export type WAConnectionState = 'open' | 'connecting' | 'close'

export type ConnectionState = {
	/** connection is now open, connecting or closed */
	connection: WAConnectionState

	/** the error that caused the connection to close */
	lastDisconnect?: {
		// TODO: refactor and gain independence from Boom
		error: Boom | Error | undefined
		date: Date
	}
	/** is this a new login */
	isNewLogin?: boolean
	/** the current QR code */
	qr?: string
	/** has the device received all pending notifications while it was offline */
	receivedPendingNotifications?: boolean
	/** legacy connection options */
	legacy?: {
		phoneConnected: boolean
		user?: Contact
	}
	/**
	 * if the client is shown as an active, online client.
	 * If this is false, the primary phone and other devices will receive notifs
	 * */
	isOnline?: boolean

	/**
	 * [PATCH-037] cherry-pick Baileys rc10 — When you are in this state, WhatsApp
	 * prevents outgoing messages and calls. Populado quando recebemos notification
	 * `NotificationUserReachoutTimelockUpdate` (anti-fraud restriction da Meta).
	 */
	reachoutTimeLock?: ReachoutTimelockState
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — Estado de reachout timelock. Quando
 * `isActive=true`, a conta está restrita; sendMessage 1:1 sem TC token resulta
 * em NACK 463. Caller pode pausar campanhas e exibir alerta quando ativo.
 */
export type ReachoutTimelockState = {
	isActive?: boolean
	timeEnforcementEnds?: Date
	enforcementType?: ReachoutTimelockEnforcementType
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — Tipo de restrição. `DEFAULT` significa
 * sem restrição. Demais valores são categorias específicas de violação detectada
 * pelo anti-fraud da Meta (commerce policy, biz quality, web companion-only, etc).
 */
export enum ReachoutTimelockEnforcementType {
	BIZ_COMMERCE_VIOLATION_ALCOHOL = 'BIZ_COMMERCE_VIOLATION_ALCOHOL',
	BIZ_COMMERCE_VIOLATION_ADULT = 'BIZ_COMMERCE_VIOLATION_ADULT',
	BIZ_COMMERCE_VIOLATION_ANIMALS = 'BIZ_COMMERCE_VIOLATION_ANIMALS',
	BIZ_COMMERCE_VIOLATION_BODY_PARTS_FLUIDS = 'BIZ_COMMERCE_VIOLATION_BODY_PARTS_FLUIDS',
	BIZ_COMMERCE_VIOLATION_DATING = 'BIZ_COMMERCE_VIOLATION_DATING',
	BIZ_COMMERCE_VIOLATION_DIGITAL_SERVICES_PRODUCTS = 'BIZ_COMMERCE_VIOLATION_DIGITAL_SERVICES_PRODUCTS',
	BIZ_COMMERCE_VIOLATION_DRUGS = 'BIZ_COMMERCE_VIOLATION_DRUGS',
	BIZ_COMMERCE_VIOLATION_DRUGS_ONLY_OTC = 'BIZ_COMMERCE_VIOLATION_DRUGS_ONLY_OTC',
	BIZ_COMMERCE_VIOLATION_GAMBLING = 'BIZ_COMMERCE_VIOLATION_GAMBLING',
	BIZ_COMMERCE_VIOLATION_HEALTHCARE = 'BIZ_COMMERCE_VIOLATION_HEALTHCARE',
	BIZ_COMMERCE_VIOLATION_REAL_FAKE_CURRENCY = 'BIZ_COMMERCE_VIOLATION_REAL_FAKE_CURRENCY',
	BIZ_COMMERCE_VIOLATION_SUPPLEMENTS = 'BIZ_COMMERCE_VIOLATION_SUPPLEMENTS',
	BIZ_COMMERCE_VIOLATION_TOBACCO = 'BIZ_COMMERCE_VIOLATION_TOBACCO',
	BIZ_COMMERCE_VIOLATION_VIOLENT_CONTENT = 'BIZ_COMMERCE_VIOLATION_VIOLENT_CONTENT',
	BIZ_COMMERCE_VIOLATION_WEAPONS = 'BIZ_COMMERCE_VIOLATION_WEAPONS',
	BIZ_QUALITY = 'BIZ_QUALITY',
	/** This means there is no restriction */
	DEFAULT = 'DEFAULT',
	WEB_COMPANION_ONLY = 'WEB_COMPANION_ONLY'
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — Status discreto de capping. Define
 * o nível de pressão anti-spam que a Meta está aplicando.
 */
export enum NewChatMessageCappingStatusType {
	NONE = 'NONE',
	FIRST_WARNING = 'FIRST_WARNING',
	SECOND_WARNING = 'SECOND_WARNING',
	CAPPED = 'CAPPED'
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — Subscription/multi-verification status
 * da conta. Conta com `ACTIVE` tem capping mais permissivo.
 */
export enum NewChatMessageCappingMVStatusType {
	NOT_ELIGIBLE = 'NOT_ELIGIBLE',
	NOT_ACTIVE = 'NOT_ACTIVE',
	ACTIVE = 'ACTIVE',
	ACTIVE_UPGRADE_AVAILABLE = 'ACTIVE_UPGRADE_AVAILABLE'
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — One-Time Extension status pra capping.
 * Permite que a conta peça aumento temporário do cap.
 */
export enum NewChatMessageCappingOTEStatusType {
	NOT_ELIGIBLE = 'NOT_ELIGIBLE',
	ELIGIBLE = 'ELIGIBLE',
	ACTIVE_IN_CURRENT_CYCLE = 'ACTIVE_IN_CURRENT_CYCLE',
	EXHAUSTED = 'EXHAUSTED'
}

/**
 * [PATCH-037] cherry-pick Baileys rc10 — Estado de cap de mensagens novas pra
 * contatos não-existentes. Retornado em `xwa2_message_capping_info` query e
 * em notification `MessageCappingInfoNotification`.
 *
 * Campos chave pra automation: `used_quota` vs `total_quota` indica quantas
 * mensagens novas ainda restam dentro do ciclo (window definida por
 * `cycle_start_timestamp` → `cycle_end_timestamp`).
 *
 * Anti-detect prático: pausar campanhas quando `used_quota / total_quota > 0.9`
 * evita NACK 463 em cascata + log "Sender Reachout Timelocked".
 */
export type NewChatMessageCapInfo = {
	total_quota?: number
	used_quota?: number
	cycle_start_timestamp?: string
	cycle_end_timestamp?: string
	server_sent_timestamp?: string
	ote_status?: NewChatMessageCappingOTEStatusType
	mv_status?: NewChatMessageCappingMVStatusType
	capping_status?: NewChatMessageCappingStatusType
}

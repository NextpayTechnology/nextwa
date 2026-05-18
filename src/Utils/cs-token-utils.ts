/**
 * [PATCH-025] CS Token (Client-Server token) — port from zapo
 * (`src/client/tokens/cs-token.ts`).
 *
 * CS Token é o "placeholder" enviado pelo WhatsApp Web em sends 1:1 quando
 * AINDA não há `<tctoken>` trusted-contact em cache pro destinatário. Sem ele:
 *
 *   - Toda PRIMEIRA mensagem pra um contato novo sai SEM nenhum token →
 *     fingerprint forte de bot (WA Web sempre manda CS ou TC, nunca nada).
 *   - WA usa o CS token pra correlacionar o "fresh send pattern" com a
 *     identidade da conta enquanto o TC token bake-time (~7d) decorre.
 *
 * Algoritmo (igual zapo):
 *   csToken = HMAC-SHA256(nctSalt, UTF8(meLid))
 *
 * Onde:
 *   - `nctSalt`: 32 bytes recebidos do server WA via stanza dedicada (a
 *     extração da wire varia entre forks; expomos `setNctSalt` pra que o
 *     handler de notification ou de success grave quando identificarmos
 *     a stanza no nosso wa-core). Default: storage `authState.keys` na
 *     categoria `tctoken` com chave sentinel `__nct_salt__`.
 *   - `meLid`: o LID da nossa conta (`@lid`), populado em `creds.me.lid`
 *     após `CB:success`.
 *
 * Cache LRU bounded em 5 entries (a única chave que varia é meLid em caso
 * de coexistence/multi-account; 5 cobre cenário extremo).
 *
 * IMPORTANTE — opt-in: o attach do `<cstoken>` no stanza fica condicionado a
 * `nctSalt` E `meLid` estarem presentes. Sem salt OU sem LID → no-op
 * silencioso (mesmo comportamento de hoje). Quando wire identificada e
 * `setNctSalt` chamada, o attach passa a acontecer automaticamente em sends
 * 1:1 que NÃO têm TC token vigente.
 */

import { createHmac } from 'crypto'
import type { BinaryNode } from '../WABinary'
import type { AuthenticationCreds, SignalKeyStoreWithTransaction } from '../Types'

// Chave sentinel pra storage do NCT salt dentro da categoria `tctoken`.
// Reusa o bucket de tokens em vez de criar categoria nova — não exige migration
// de schema do `useMultiFileAuthState` nem de stores SQL custom.
export const NCT_SALT_STORE_KEY = '__nct_salt__'

const CS_TOKEN_CACHE_MAX = 5

interface CsTokenCacheEntry {
	readonly accountLid: string
	readonly token: Buffer
}

/**
 * Gera CS Token via HMAC-SHA256(salt, accountLid). Cache bounded:
 *   - chave: accountLid
 *   - invalida automaticamente quando salt muda (ex.: rotação periódica do
 *     server, troca de conta na mesma instância via re-pair)
 */
export class CsTokenGenerator {
	private cachedSalt: Buffer | null
	private cache: Map<string, Buffer>

	constructor() {
		this.cachedSalt = null
		this.cache = new Map()
	}

	generate(nctSalt: Buffer, accountLid: string): Buffer {
		if (this.isSameSalt(nctSalt)) {
			const cached = this.cache.get(accountLid)
			if (cached) return cached
		} else {
			this.cachedSalt = Buffer.from(nctSalt)
			this.cache.clear()
		}

		const hash = createHmac('sha256', nctSalt).update(accountLid, 'utf8').digest()

		// LRU bounded: se exceder cap, remove o mais antigo (Map preserva ordem de inserção).
		if (this.cache.size >= CS_TOKEN_CACHE_MAX) {
			const oldest = this.cache.keys().next().value
			if (oldest !== undefined) this.cache.delete(oldest)
		}
		this.cache.set(accountLid, hash)
		return hash
	}

	invalidate(): void {
		this.cachedSalt = null
		this.cache.clear()
	}

	private isSameSalt(salt: Buffer): boolean {
		if (!this.cachedSalt || this.cachedSalt.length !== salt.length) return false
		return this.cachedSalt.equals(salt)
	}
}

/**
 * Builder do binary node `<cstoken>content=hash</cstoken>` — embutido no
 * stanza `<message>` exatamente como o `<tctoken>` (mesmo path, alternativa).
 */
export function buildCsTokenMessageNode(hash: Buffer | Uint8Array): BinaryNode {
	return {
		tag: 'cstoken',
		attrs: {},
		content: hash instanceof Buffer ? hash : Buffer.from(hash)
	}
}

/**
 * Lê o NCT salt do auth store. Retorna `null` se ainda não foi gravado.
 *
 * Storage layout: categoria `tctoken`, chave `NCT_SALT_STORE_KEY`, valor um
 * `{ salt: Buffer }` (objeto wrapper pra que o reviver/replacer do
 * `useMultiFileAuthState` consiga serializar como Buffer).
 */
export async function getNctSalt(
	keys: Pick<SignalKeyStoreWithTransaction, 'get'>
): Promise<Buffer | null> {
	try {
		const data = await keys.get('tctoken' as never, [NCT_SALT_STORE_KEY])
		const entry = (data as Record<string, unknown>)?.[NCT_SALT_STORE_KEY]
		if (!entry || typeof entry !== 'object') return null
		const salt = (entry as { salt?: unknown }).salt
		if (Buffer.isBuffer(salt)) return salt
		if (salt instanceof Uint8Array) return Buffer.from(salt)
		return null
	} catch {
		return null
	}
}

/**
 * Grava o NCT salt no auth store. Deve ser chamado pelo handler que
 * identifica a stanza WA do salt (provavelmente `<notification type=...>`
 * com criança específica, OU `<success>` carregando atributo extra).
 *
 * Mantemos best-effort: falha de gravação loga warn mas não quebra o flow.
 */
export async function setNctSalt(
	keys: Pick<SignalKeyStoreWithTransaction, 'set'>,
	salt: Buffer | Uint8Array
): Promise<void> {
	const buf = salt instanceof Buffer ? salt : Buffer.from(salt)
	if (buf.length === 0) return
	await keys.set({
		tctoken: {
			[NCT_SALT_STORE_KEY]: { salt: buf } as never
		} as never
	} as never)
}

/**
 * Helper de alto nível: resolve qual token attachar (TC > CS > null) baseado
 * no estado atual do socket. Caller passa:
 *   - `tcTokenBuffer`: buffer do TC token vigente OU null (já checado expiry)
 *   - `creds`: pra extrair `me.lid`
 *   - `generator`: instância do CsTokenGenerator do socket (per-socket)
 *   - `keys`: storage pra carregar NCT salt
 *
 * Retorna o `<tctoken>` ou `<cstoken>` BinaryNode pronto pra push no stanza,
 * ou null se nenhum dos dois disponível (comportamento legado).
 */
export async function resolvePrivacyTokenNode(
	tcTokenBuffer: Buffer | undefined,
	creds: AuthenticationCreds,
	generator: CsTokenGenerator,
	keys: Pick<SignalKeyStoreWithTransaction, 'get'>
): Promise<BinaryNode | null> {
	if (tcTokenBuffer && tcTokenBuffer.length > 0) {
		return { tag: 'tctoken', attrs: {}, content: tcTokenBuffer }
	}
	const meLid = creds.me?.lid
	if (!meLid) return null

	const salt = await getNctSalt(keys)
	if (!salt) return null

	const hash = generator.generate(salt, meLid)
	return buildCsTokenMessageNode(hash)
}

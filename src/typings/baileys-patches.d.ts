/**
 * Declarações de compatibilidade aplicadas sobre o Baileys upstream (v6.7.21)
 * para permitir build limpo no monorepo imp-zapp (Node 20+, peer deps
 * opcionais resolvidos apenas em runtime).
 *
 * Cada bloco aqui mitiga um erro específico que o tsc do upstream produz
 * quando peer deps opcionais não estão instaladas ou têm API divergente
 * da que o Baileys foi escrito contra.
 *
 * Este arquivo é PATCH-001 do nosso fork — ver PATCHES.md.
 */

// ─── libsignal ───────────────────────────────────────────────────────────────
// O upstream importa `libsignal` com `@ts-ignore` porque a lib não publica
// tipos. O código roda perfeito em runtime; só precisamos declarar os shapes
// que o código de fato usa para o tsc parar de reclamar.

declare module 'libsignal' {
	/* eslint-disable @typescript-eslint/no-explicit-any */

	export const curve: {
		generateKeyPair(): { pubKey: Uint8Array; privKey: Uint8Array }
		calculateAgreement(pubKey: Uint8Array | Buffer, privKey: Uint8Array | Buffer): Uint8Array | Buffer
		calculateSignature(privKey: Uint8Array | Buffer, data: Uint8Array | Buffer): Uint8Array | Buffer
		verifySignature(
			pubKey: Uint8Array | Buffer,
			data: Uint8Array | Buffer,
			signature: Uint8Array | Buffer
		): boolean
	}

	// O storage real é um objeto do qual apenas os métodos em runtime importam.
	// Declaramos como `any` para que qualquer impl (incluindo SenderKeyStore
	// nosso) seja aceita — libsignal faz duck typing internamente.
	export class SessionCipher {
		constructor(storage: any, address: any)
		decryptPreKeyWhisperMessage(ciphertext: Uint8Array | Buffer | string): Promise<Buffer>
		decryptWhisperMessage(ciphertext: Uint8Array | Buffer | string): Promise<Buffer>
		encrypt(data: Uint8Array | Buffer): Promise<{ type: number; body: string }>
	}

	export class SessionBuilder {
		constructor(storage: any, address: any)
		initOutgoing(session: any): Promise<void>
	}

	// `id` e `deviceId` são expostos via propriedades diretas em runtime
	// (libsignal faz duck-type). Declaramos aqui para SenderKeyName aceitar.
	export class ProtocolAddress {
		constructor(user: string, device: number)
		id: string
		deviceId: number
		toString(): string
	}

	export class SessionRecord {
		static deserialize(data: any): SessionRecord
		serialize(): any
	}
}

// ─── link-preview-js ─────────────────────────────────────────────────────────
// Peer dep OPCIONAL do Baileys — o código só importa se o usuário habilita
// link preview. Declaramos como stub permissivo; se alguém usar sem instalar
// a dep de verdade, o erro ocorre em runtime com mensagem clara do require().

declare module 'link-preview-js' {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	export function getLinkPreview(url: string, options?: any): Promise<any>
}

// ─── jimp ────────────────────────────────────────────────────────────────────
// O upstream usa `jimp` como peer dep opcional e acessa `lib.jimp.Jimp` e
// `lib.jimp.ResizeStrategy`. Na versão nova de `jimp` (1.x) o shape mudou.
// Como é acesso dinâmico via `await import('jimp')`, augmentamos o módulo
// para declarar os nomes que o Baileys usa — casts em runtime cobrem o resto.

declare module 'jimp' {
	/* eslint-disable @typescript-eslint/no-explicit-any */
	export const Jimp: any
	export const ResizeStrategy: {
		BILINEAR: string
		NEAREST_NEIGHBOR: string
		BICUBIC: string
		HERMITE: string
		BEZIER: string
	}
}

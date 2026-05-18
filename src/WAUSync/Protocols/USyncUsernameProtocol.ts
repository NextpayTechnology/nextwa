/**
 * [PATCH-045] cherry-pick Baileys rc10 — port literal de
 * `USyncUsernameProtocol.ts` do upstream. Permite consultar usernames
 * de contatos via USync (User Sync, infraestrutura de batch queries de
 * presença/devices/lid).
 *
 * MOTIVAÇÃO ATUAL: ainda não fazemos lookup de username via USync — mas o
 * protocol fica disponível pra wave futura. Anti-detect: WA Web sempre
 * tem todos os USync protocols carregados; sem isso fica fingerprint de
 * "cliente parcial".
 */
import type { USyncQueryProtocol } from '../../Types/USync'
import { assertNodeErrorFree, type BinaryNode } from '../../WABinary'
import { USyncUser } from '../USyncUser'

export class USyncUsernameProtocol implements USyncQueryProtocol {
	name = 'username'

	getQueryElement(): BinaryNode {
		return {
			tag: 'username',
			attrs: {}
		}
	}

	getUserElement(user: USyncUser): BinaryNode | null {
		void user
		return null
	}

	parser(node: BinaryNode): string | null {
		if (node.tag === 'username') {
			assertNodeErrorFree(node)
			return typeof node.content === 'string' ? node.content : null
		}

		return null
	}
}

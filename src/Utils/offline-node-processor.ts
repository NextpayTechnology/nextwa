/**
 * [PATCH-027] cherry-pick Baileys master — offline node processor.
 *
 * Port direto de `Baileys-master/src/Utils/offline-node-processor.ts` (Baileys
 * v7 rc10 — "improved offline node batching" by @Santosl2).
 *
 * Em logins novos / reconnects, o WA envia uma rajada de `<notification>`,
 * `<message>`, `<receipt>` e `<call>` represados (offline batch). Processar
 * todos em sequência síncrona bloqueia o event loop por 5-20s em workspaces
 * com histórico grande — impede WS keepalive de responder, gera "Connection
 * was lost" falso.
 *
 * Esta fábrica:
 *   - Enfileira nodes por tipo
 *   - Processa sequencial (preserva ordem das stanzas, importante pro Signal)
 *   - Yieldsa pro event loop a cada `batchSize` nodes (default 10)
 *   - Captura erros do handler sem derrubar o loop
 *
 * Anti-detecção: WA Web também faz batching com yields — sem isso, nosso
 * cliente processa "instantaneamente demais" (sem latência humana visível
 * entre msgs do batch), telltale de cliente automatizado.
 */
import type { BinaryNode } from '../WABinary'

// Renomeado de `MessageType` (no upstream) pra `OfflineNodeType` pra evitar
// colisão com o `MessageType` do `messages-media.ts` (HKDF key types) que
// nosso wa-core já re-exporta no top-level.
export type OfflineNodeType = 'message' | 'call' | 'receipt' | 'notification'

type OfflineNode = {
	type: OfflineNodeType
	node: BinaryNode
}

export type OfflineNodeProcessorDeps = {
	isWsOpen: () => boolean
	onUnexpectedError: (error: Error, msg: string) => void
	yieldToEventLoop: () => Promise<void>
}

/**
 * Creates a processor for offline stanza nodes that:
 * - Queues nodes for sequential processing
 * - Yields to the event loop periodically to avoid blocking
 * - Catches handler errors to prevent the processing loop from crashing
 */
export function makeOfflineNodeProcessor(
	nodeProcessorMap: Map<OfflineNodeType, (node: BinaryNode) => Promise<void>>,
	deps: OfflineNodeProcessorDeps,
	batchSize = 10
) {
	const nodes: OfflineNode[] = []
	let isProcessing = false

	const enqueue = (type: OfflineNodeType, node: BinaryNode) => {
		nodes.push({ type, node })

		if (isProcessing) {
			return
		}

		isProcessing = true

		const promise = async () => {
			let processedInBatch = 0

			while (nodes.length && deps.isWsOpen()) {
				const { type, node } = nodes.shift()!

				const nodeProcessor = nodeProcessorMap.get(type)

				if (!nodeProcessor) {
					deps.onUnexpectedError(new Error(`unknown offline node type: ${type}`), 'processing offline node')
					continue
				}

				await nodeProcessor(node).catch(err => deps.onUnexpectedError(err, `processing offline ${type}`))
				processedInBatch++

				// Yield to event loop after processing a batch
				// This prevents blocking the event loop for too long when there are many offline nodes
				if (processedInBatch >= batchSize) {
					processedInBatch = 0
					await deps.yieldToEventLoop()
				}
			}

			isProcessing = false
		}

		promise().catch(error => deps.onUnexpectedError(error, 'processing offline nodes'))
	}

	return { enqueue }
}

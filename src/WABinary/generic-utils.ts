import { Boom } from '@hapi/boom'
import { proto } from '../../WAProto/index.js'
import { type BinaryNode } from './types'

// some extra useful utilities

/**
 * [PATCH-023] cherry-pick Baileys rc10 (purpshell) — WeakMap cache pra getBinaryNodeChildren
 * + getBinaryNodeChild. Stanzas binários com muitas children + lookups repetidos pela MESMA
 * tag (ex.: `participants` em group fanout) faziam Array.filter linear cada vez. Em mensagens
 * pra grupos grandes ou stanzas de history-sync, o lookup repetido virava 30% do CPU de send/recv.
 *
 * WeakMap garante GC: quando o BinaryNode sai de escopo (parsed stanza descartado), o mapa
 * de tag→children some junto. Sem refs longas, sem leak de memória.
 *
 * Inner Map: tag (string) → cached array de children. Lazy fill — só popula quando chamado.
 * Lookup miss: roda o filter original, salva em cache, retorna.
 */
type BinaryChildrenCacheEntry = Map<string, BinaryNode[]>
const binaryChildrenCache = new WeakMap<BinaryNode, BinaryChildrenCacheEntry>()

function getOrInitChildrenCache(node: BinaryNode): BinaryChildrenCacheEntry {
	let entry = binaryChildrenCache.get(node)
	if (!entry) {
		entry = new Map()
		binaryChildrenCache.set(node, entry)
	}
	return entry
}

export const getBinaryNodeChildren = (node: BinaryNode | undefined, childTag: string) => {
	if (!node || !Array.isArray(node.content)) return []

	// [PATCH-023] cache hit-path. WeakMap chaveada pelo node, inner Map pela tag.
	const cache = getOrInitChildrenCache(node)
	const hit = cache.get(childTag)
	if (hit) return hit

	const filtered = node.content.filter(item => item.tag === childTag)
	cache.set(childTag, filtered)
	return filtered
}

export const getAllBinaryNodeChildren = ({ content }: BinaryNode) => {
	if (Array.isArray(content)) {
		return content
	}

	return []
}

export const getBinaryNodeChild = (node: BinaryNode | undefined, childTag: string) => {
	if (!node || !Array.isArray(node.content)) return undefined

	// [PATCH-023] reusa o cache de children pra encontrar o primeiro. O cost é o mesmo
	// (children já filtrados), mas evita re-scan quando alguém chamou getBinaryNodeChildren
	// pra mesma tag antes (caso super comum em messages-recv.ts).
	const cached = binaryChildrenCache.get(node)?.get(childTag)
	if (cached) return cached[0]

	return node.content.find(item => item.tag === childTag)
}

export const getBinaryNodeChildBuffer = (node: BinaryNode | undefined, childTag: string) => {
	const child = getBinaryNodeChild(node, childTag)?.content
	if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
		return child
	}
}

export const getBinaryNodeChildString = (node: BinaryNode | undefined, childTag: string) => {
	const child = getBinaryNodeChild(node, childTag)?.content
	if (Buffer.isBuffer(child) || child instanceof Uint8Array) {
		return Buffer.from(child).toString('utf-8')
	} else if (typeof child === 'string') {
		return child
	}
}

export const getBinaryNodeChildUInt = (node: BinaryNode, childTag: string, length: number) => {
	const buff = getBinaryNodeChildBuffer(node, childTag)
	if (buff) {
		return bufferToUInt(buff, length)
	}
}

export const assertNodeErrorFree = (node: BinaryNode) => {
	const errNode = getBinaryNodeChild(node, 'error')
	if (errNode) {
		throw new Boom(errNode.attrs.text || 'Unknown error', { data: +errNode.attrs.code! })
	}
}

export const reduceBinaryNodeToDictionary = (node: BinaryNode, tag: string) => {
	const nodes = getBinaryNodeChildren(node, tag)
	const dict = nodes.reduce(
		(dict, { attrs }) => {
			if (typeof attrs.name === 'string') {
				dict[attrs.name] = attrs.value! || attrs.config_value!
			} else {
				dict[attrs.config_code!] = attrs.value! || attrs.config_value!
			}

			return dict
		},
		{} as { [_: string]: string }
	)
	return dict
}

export const getBinaryNodeMessages = ({ content }: BinaryNode) => {
	const msgs: proto.WebMessageInfo[] = []
	if (Array.isArray(content)) {
		for (const item of content) {
			if (item.tag === 'message') {
				msgs.push(proto.WebMessageInfo.decode(item.content as Buffer).toJSON() as proto.WebMessageInfo)
			}
		}
	}

	return msgs
}

function bufferToUInt(e: Uint8Array | Buffer, t: number) {
	let a = 0
	for (let i = 0; i < t; i++) {
		a = 256 * a + e[i]!
	}

	return a
}

const tabs = (n: number) => '\t'.repeat(n)

export function binaryNodeToString(node: BinaryNode | BinaryNode['content'], i = 0): string {
	if (!node) {
		return node!
	}

	if (typeof node === 'string') {
		return tabs(i) + node
	}

	if (node instanceof Uint8Array) {
		return tabs(i) + Buffer.from(node).toString('hex')
	}

	if (Array.isArray(node)) {
		return node.map(x => tabs(i + 1) + binaryNodeToString(x, i + 1)).join('\n')
	}

	const children = binaryNodeToString(node.content, i + 1)

	const tag = `<${node.tag} ${Object.entries(node.attrs || {})
		.filter(([, v]) => v !== undefined)
		.map(([k, v]) => `${k}='${v}'`)
		.join(' ')}`

	const content: string = children ? `>\n${children}\n${tabs(i)}</${node.tag}>` : '/>'

	return tag + content
}

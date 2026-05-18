/**
 * [PATCH-031] Anti-detection — presets de fingerprint pra `SocketConfig`.
 *
 * Helpers que geram combinações REALISTAS de browser + userAgentOverrides
 * + deviceProps a partir de uma seed estável (ex.: hash do instanceId). O
 * objetivo é que N instâncias do mesmo workspace tenham fingerprints
 * INDIVIDUALMENTE plausíveis e MUTUAMENTE diversos.
 *
 * COMO USAR:
 *   import { pickFingerprintPreset, Browsers } from '@impzapp/wa-core'
 *   const fp = pickFingerprintPreset(instanceId)  // determinístico
 *   makeWASocket({
 *     ...,
 *     browser: fp.browser,
 *     countryCode: fp.countryCode,
 *     userAgentOverrides: fp.userAgentOverrides,
 *     deviceProps: fp.deviceProps,
 *   })
 *
 * Cada preset é uma "persona" realista (osVersion + osBuildNumber + browser
 * coerentes). NÃO misture fields de presets diferentes — quebra coerência.
 *
 * Fontes:
 *   - Operadoras BR (mcc=724): Vivo 06, Claro 05, TIM 04, Oi 16, Nextel 00
 *   - macOS build numbers reais por versão
 *   - Windows build numbers reais por versão (10/11)
 *   - Linguagem padrão pt (Brasil) em todos
 */
import { createHash } from 'crypto'
import type { SocketConfig, WABrowserDescription } from '../Types'
import { Browsers } from './browser-utils'

export interface FingerprintPreset {
	readonly browser: WABrowserDescription
	readonly countryCode: string
	readonly userAgentOverrides: NonNullable<SocketConfig['userAgentOverrides']>
	readonly deviceProps: NonNullable<SocketConfig['deviceProps']>
}

/**
 * Catálogo de presets — adicionar mais aumenta diversidade. Cada entrada
 * é COERENTE consigo mesma (osVersion + osBuildNumber + device platform).
 *
 * Mantemos `deviceProps.version` próximo do "WA Web app version" recente
 * (10.16.x) — atualizar conforme WA Web bumpa pra manter parity.
 */
const PRESETS: ReadonlyArray<FingerprintPreset> = [
	// === macOS / Chrome (Sequoia / Sonoma / Ventura) ===
	{
		browser: Browsers.macOS('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '15.0.1',
			device: 'Desktop',
			osBuildNumber: '24A348',
			localeLanguageIso6391: 'pt',
			mnc: '06',
			mcc: '724' // Vivo BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 8 } }
	},
	{
		browser: Browsers.macOS('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '14.6.1',
			device: 'Desktop',
			osBuildNumber: '23G93',
			localeLanguageIso6391: 'pt',
			mnc: '05',
			mcc: '724' // Claro BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 4 } }
	},
	{
		browser: Browsers.macOS('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '13.6.7',
			device: 'Desktop',
			osBuildNumber: '22G720',
			localeLanguageIso6391: 'pt',
			mnc: '04',
			mcc: '724' // TIM BR
		},
		deviceProps: { version: { primary: 10, secondary: 15, tertiary: 9 } }
	},

	// === macOS / Safari ===
	{
		browser: Browsers.macOS('Safari'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '14.6.1',
			device: 'Desktop',
			osBuildNumber: '23G93',
			localeLanguageIso6391: 'pt',
			mnc: '16',
			mcc: '724' // Oi BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 3 } }
	},

	// === Windows / Chrome ===
	{
		browser: Browsers.windows('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '10.0.22631',
			device: 'Desktop',
			osBuildNumber: '22631.4317',
			localeLanguageIso6391: 'pt',
			mnc: '06',
			mcc: '724' // Vivo BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 6 } }
	},
	{
		browser: Browsers.windows('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '10.0.26100',
			device: 'Desktop',
			osBuildNumber: '26100.2033',
			localeLanguageIso6391: 'pt',
			mnc: '05',
			mcc: '724' // Claro BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 8 } }
	},

	// === Windows / Edge ===
	{
		browser: Browsers.windows('Edge'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '10.0.22631',
			device: 'Desktop',
			osBuildNumber: '22631.4317',
			localeLanguageIso6391: 'pt',
			mnc: '04',
			mcc: '724' // TIM BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 5 } }
	},

	// === Ubuntu / Chrome ===
	{
		browser: Browsers.ubuntu('Chrome'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '22.04.5',
			device: 'Desktop',
			osBuildNumber: '6.8.0-49-generic',
			localeLanguageIso6391: 'pt',
			mnc: '06',
			mcc: '724' // Vivo BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 2 } }
	},
	{
		browser: Browsers.ubuntu('Firefox'),
		countryCode: 'BR',
		userAgentOverrides: {
			osVersion: '22.04.4',
			device: 'Desktop',
			osBuildNumber: '6.5.0-44-generic',
			localeLanguageIso6391: 'pt',
			mnc: '16',
			mcc: '724' // Oi BR
		},
		deviceProps: { version: { primary: 10, secondary: 16, tertiary: 1 } }
	}
]

/**
 * Sorteia preset determinístico baseado em `seed`. Mesmo seed → mesmo preset
 * (idempotente — sobrevive a restart, reconnect, deploy).
 *
 * Recomendado: passar `instanceId` (CUID) como seed. Cada instância tem o
 * seu preset fixo, diferente do dos outras.
 */
export function pickFingerprintPreset(seed: string): FingerprintPreset {
	const hash = createHash('sha256').update(seed, 'utf8').digest()
	// Pega 32 bits unsigned do hash (offset 0). Mais que suficiente pra
	// distribuição uniforme entre N presets pequenos.
	const index = hash.readUInt32BE(0) % PRESETS.length
	// PRESETS é readonly não-vazio; modular garante index válido.
	return PRESETS[index] as FingerprintPreset
}

/**
 * Snapshot atual dos presets — útil pra debug/admin UI ("qual é o
 * fingerprint dessa instância?") sem expor o algoritmo de pick.
 */
export function describeFingerprintForSeed(seed: string): {
	index: number
	total: number
	browser: WABrowserDescription
	countryCode: string
} {
	const hash = createHash('sha256').update(seed, 'utf8').digest()
	const index = hash.readUInt32BE(0) % PRESETS.length
	const p = PRESETS[index] as FingerprintPreset
	return {
		index,
		total: PRESETS.length,
		browser: p.browser,
		countryCode: p.countryCode
	}
}

/** Numero total de presets disponíveis. */
export const FINGERPRINT_PRESET_COUNT = PRESETS.length

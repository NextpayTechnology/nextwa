/**
 * [PATCH-044] cherry-pick Baileys rc10 — port literal de
 * `companion-reg-client-utils.ts` do upstream.
 *
 * Mapeia descrição do browser (tuple `[os, browser, version]`) → tipo
 * de cliente companion (enum `CompanionWebClientType`) usado no QR de
 * pairing pra device-linking. Constrói também a URL completa do QR
 * (`https://wa.me/settings/linked_devices#...`).
 *
 * MOTIVAÇÃO ATUAL: não usamos device-linking ainda — esses helpers ficam
 * disponíveis pra wave futura quando implementarmos "linkar app mobile
 * ao nosso backend como companion device". Port direto pra não divergir.
 *
 * Note: similar ao nosso `getPlatformId` em browser-utils.ts, mas com
 * granularidade diferente — `getPlatformId` retorna proto enum
 * `DeviceProps.PlatformType`, este aqui retorna `CompanionWebClientType`
 * (usado especificamente no fragment do URL de QR pairing).
 */
import type { WABrowserDescription } from '../Types'

export enum CompanionWebClientType {
	UNKNOWN = 0,
	CHROME = 1,
	EDGE = 2,
	FIREFOX = 3,
	IE = 4,
	OPERA = 5,
	SAFARI = 6,
	ELECTRON = 7,
	UWP = 8,
	OTHER_WEB_CLIENT = 9
}

const BROWSER_TO_COMPANION_WEB_CLIENT: Record<string, CompanionWebClientType> = {
	Chrome: CompanionWebClientType.CHROME,
	Edge: CompanionWebClientType.EDGE,
	Firefox: CompanionWebClientType.FIREFOX,
	IE: CompanionWebClientType.IE,
	Opera: CompanionWebClientType.OPERA,
	Safari: CompanionWebClientType.SAFARI
}

export const getCompanionWebClientType = ([os, browserName]: WABrowserDescription): CompanionWebClientType => {
	if (browserName === 'Desktop') {
		return os === 'Windows' ? CompanionWebClientType.UWP : CompanionWebClientType.ELECTRON
	}

	return BROWSER_TO_COMPANION_WEB_CLIENT[browserName] || CompanionWebClientType.OTHER_WEB_CLIENT
}

export const getCompanionPlatformId = (browser: WABrowserDescription): string => {
	return getCompanionWebClientType(browser).toString()
}

export const buildPairingQRData = (
	ref: string,
	noiseKeyB64: string,
	identityKeyB64: string,
	advB64: string,
	browser: WABrowserDescription
): string => {
	return (
		'https://wa.me/settings/linked_devices#' +
		[ref, noiseKeyB64, identityKeyB64, advB64, getCompanionPlatformId(browser)].join(',')
	)
}

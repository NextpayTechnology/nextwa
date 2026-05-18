/**
 * [PATCH-024] ServerClock — port from zapo (vinikjkkj/zapo: src/util/clock.ts).
 *
 * Tracks the offset between the local clock and the WhatsApp server clock,
 * derived from `<success t="..."/>` after each successful login. Tokens, IQ
 * timestamps and TTL math use the server-aligned time so the wire timestamps
 * we send match what the server expects.
 *
 * Why this matters anti-ban:
 *   - WA Web reads server time on every connect and uses it as the canonical
 *     clock for outgoing privacy tokens (`<tctoken t=...>`), reporting tokens,
 *     IQ stamps, and session expiry. If our host clock drifts (NTP off, VM
 *     freezing/thawing, container clock skew), token timestamps look "in the
 *     future" or "in the past" to the server — an automation-detection signal.
 *   - Real WA Web ALWAYS uses server-derived time; clients with local-time
 *     drift are statistically rare and easy to flag.
 *
 * API contract:
 *   - `updateFromSuccessAttr(t)` — fed from `CB:success` handler with the
 *     server's `t` attr (unix seconds, as string).
 *   - `nowSeconds()` — returns server-aligned current unix seconds. Falls back
 *     to local clock if no skew has been measured yet.
 *   - `nowMilliseconds()` — same but ms precision.
 *   - `getSkewMs()` — for debug/telemetry.
 *
 * Trade-off: per-socket instance (not process-global) — each socket has its
 * own clock skew tracker, since the host clock might drift differently across
 * the lifetime of N sockets started at different times.
 */

export interface ServerClock {
	updateFromSuccessAttr(t: string | undefined): void
	updateFromSeconds(serverUnixSeconds: number): void
	nowSeconds(): number
	nowMilliseconds(): number
	getSkewMs(): number | null
}

export function makeServerClock(logger?: { debug?: (obj: unknown, msg: string) => void }): ServerClock {
	let skewMs: number | null = null

	function updateFromSeconds(serverUnixSeconds: number): void {
		if (!Number.isFinite(serverUnixSeconds) || serverUnixSeconds <= 0) return
		const serverMs = serverUnixSeconds * 1000
		const nowMs = Date.now()
		const newSkew = serverMs - nowMs
		// Only log significant changes (>1s) — small intra-second drift is normal.
		if (skewMs === null || Math.abs((skewMs ?? 0) - newSkew) >= 1_000) {
			logger?.debug?.(
				{ previousSkewMs: skewMs, newSkewMs: newSkew, serverUnixSeconds },
				'[PATCH-024] server clock skew updated',
			)
		}
		skewMs = newSkew
	}

	function updateFromSuccessAttr(t: string | undefined): void {
		if (!t) return
		const parsed = Number.parseInt(t, 10)
		if (!Number.isFinite(parsed)) return
		updateFromSeconds(parsed)
	}

	function nowMilliseconds(): number {
		const local = Date.now()
		return skewMs === null ? local : local + skewMs
	}

	function nowSeconds(): number {
		return Math.floor(nowMilliseconds() / 1000)
	}

	function getSkewMs(): number | null {
		return skewMs
	}

	return { updateFromSuccessAttr, updateFromSeconds, nowSeconds, nowMilliseconds, getSkewMs }
}

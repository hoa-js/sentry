import type { HoaMiddleware } from 'hoa'
import type { Options as ToucanOptions } from 'toucan-js'

export type SentryOptions = Partial<Omit<ToucanOptions, 'request' | 'context'>>

export function sentry (options?: SentryOptions): HoaMiddleware

export default sentry
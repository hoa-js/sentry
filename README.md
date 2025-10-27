## @hoajs/sentry

Sentry middleware for Hoa.

## Installation

```bash
$ npm i @hoajs/sentry --save
```

## Quick Start

```js
import { Hoa } from 'hoa'
import { sentry } from '@hoajs/sentry'

const app = new Hoa()
app.use(sentry({ dsn: 'xxx' }))

app.use(async (ctx) => {
  ctx.throw(400, 'Some error')
})

export default app
```

## Documentation

The documentation is available on [hoa-js.com](https://hoa-js.com/middleware/debug/sentry.html)

## Test (100% coverage)

```sh
$ npm test
```

## License

MIT

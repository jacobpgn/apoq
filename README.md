# apoq

**A** **Po**stgreSQL **Q**ueue for processing background tasks, with a focus on simplicity and reliability.

# Example

```js
const { Apoq } = require("apoq")

const MESSAGES = ["💖", "🧡", "💛", "💚", "💙"]
const randomColor = () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]

const main = async () => {
  const apoq = new Apoq(process.env.DATABASE_URL)

  // Prepare the database tables to record tasks
  await apoq.prepare()

  // Add some example "sendMessage" tasks
  for (let i = 0; i < 100; i++) {
    await apoq.add("sendMessage", { color: randomColor() })
  }

  // Give apoq a function which processes "sendMessage" tasks
  apoq.use("sendMessage", async ({ data }) => {
    console.log(`📧 sending a ${data.color}`)
  })

  // Listen for task completed events
  apoq.events.on("task.completed", (task) => {
    console.log(`✨ task ${task.id} complete`)
  })

  // Start processing tasks!
  await apoq.start()
}

main()
```

# Usage

## Configuration and setup

Initialize an instance of apoq with a connection string or an object of [options](https://node-postgres.com/features/connecting#programmatic) that the [`pg`](https://node-postgres.com) library accepts, for example:

```js
const { Apoq } = require("apoq")

const apoq = new Apoq(process.env.DATABASE_URL)
```

or

```js
const { Apoq } = require("apoq")

const apoq = new Apoq({
  user: 'postgres',
  host: 'localhost',
  database: 'app',
  password: 'shhh!',
  port: 5432,
})
```

## Migrating the database

The library manages 2 tables (`apoq_tasks` and `apoq_migrations`), and the `prepare()` function takes care of running any pending migrations against an apoq instance. You need to run this before using the library; for convenience, you might choose to run it automatically during deployments on when your app starts.

```js
const { Apoq } = require("apoq")

const apoq = new Apoq(process.env.DATABASE_URL)
await apoq.prepare()
```

## Instance functions

### `add`
```js
add(type: string, data: object)
```

Add a task to the queue. The `type` is used by workers to determine what to do when processing this task, so you'll probably want to use it to either label the work to be done (e.g. `sendWelcomeEmail`) or as an event name (e.g. `user.created`).

The `data` object can hold any additional information for the task processor, e.g. `{ userId: 123 }`. It'll be stored in a JSONB column.

```js
apoq.add("logMessage", { foo: "bar!" })
```

### `use`
```js
use(type: string, processor: function)

use(type: string, processor: function, options: { retryDelay: function, retryLimit: number })
```

Configures a processor function this worker should use for a specific type of task. The worker will call the `processor` function for each task we `add` with the same `type`.

```js
const processor = (args) => {
  console.log(`Message: ${args.data.foo}`)
}

apoq.use("logMessage", processor)
```

You can also provide retry options to indicate how the worker should deal with tasks the fail. By default task processors have a `retryLimit` of `5`, so they will retry a task up to 5 times (for a total of 6 attempts) if it fails. `retryDelay` is a function which takes the current number of failures and determines how many seconds to wait before the next attempt. The default `retryDelay` function exponentially backs off with jitter.

Here's an example of a simple custom retry delay which will retry 2 seconds after the first failure, 4 seconds after the second failure, 6 seconds after the third failure, then give up because of the limit:

```js
const processor = async (args) => {
  await fetch("https://flaky.example")
}

const retryDelay = (failCount) => {
  return failCount * 2
}

apog.use("pingFlakyApi", processor, { retryLimit: 3, retryDelay })
```

### `start`
```js
await apoq.start()
```

Starts a worker, which will check for all task types configured with `use` and run their functions for you.

### `work`
```js
await apoq.work()
```

Transactionally works the next configured task in the queue. This will run a single task then resolve, marking the task as completed or failed. If there are no tasks, it'll resolve.

Most of the time you'll want to use `start` instead, as `start` continues to run (or wait for) tasks until the worker is stopped while `work` only runs a single task.

### `stop`
```js
await apoq.stop()
```

Stops a worker started with `start`. Any tasks that are already actively being processed by the worker will continue until they complete or fail, but no more tasks will be started.

## Events

You can subscribe to events for an apoq instance.

### `task.completed`

This event is emitted after a task has been completed and the task's transaction has committed. It receives the completed task as an argument.

```js
apoq.events.on("task.completed", (task) => {
  console.log(`✨ task ${task.id} complete`)
})
```

### `task.failed`

This event is emitted when a task fails, eg. the task processor function threw an error. It receives the failed task and the error as arguments.

The task will be in the `failed` state, and will not be retried automatically.

```js
apoq.events.on("task.failed", (task, error) => {
  console.log(`💥 task ${task.id} failed...`)
  console.error(error)
})
```

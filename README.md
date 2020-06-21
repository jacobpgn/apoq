# apoq

**A** **Po**stgreSQL **Q**ueue for processing background tasks, with a focus on simplicity and reliability.

## Example

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

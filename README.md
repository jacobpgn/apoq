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
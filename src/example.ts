import { Apoq } from "./index"

const MESSAGES = ["💖", "🧡", "💛", "💚", "💙"]
const randomColor = () => MESSAGES[Math.floor(Math.random() * MESSAGES.length)]

const main = async () => {
  const apoq = new Apoq("postgres://jacobpargin:@localhost/apoq_dev")

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

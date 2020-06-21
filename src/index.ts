import { Pool } from "pg"
import { EventEmitter } from "events"
import { migrate } from "./migrate"

interface TaskConfig {
  [taskName: string]: { processor: TaskProcessor }
}

interface TaskProcessor {
  ({ data }: { data: any }): Promise<void>
}

export const DEFAULT_TASK_TABLE = "apoq_tasks"

export default class Apoq {
  private pool: Pool
  private taskConfig: TaskConfig = {}
  private isRunning = false
  events: EventEmitter = new EventEmitter()

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, application_name: "apoq" })
  }

  async prepare(): Promise<void> {
    await migrate(this.pool, { taskTable: DEFAULT_TASK_TABLE })
  }

  async add(type: string, data: unknown): Promise<{ id: string }> {
    const insertResult = await this.pool.query(
      ` INSERT INTO ${DEFAULT_TASK_TABLE} (type, data)
        VALUES ($1, $2)
        RETURNING *`,
      [type, data]
    )

    return { id: insertResult.rows[0].id }
  }

  use(type: string, processor: TaskProcessor): void {
    this.taskConfig[type] = { processor }
  }

  private async work() {
    const client = await this.pool.connect()

    await client.query("BEGIN")
    const taskQueryResult = await client.query(
      ` SELECT *
        FROM ${DEFAULT_TASK_TABLE}
        WHERE state = 'pending'
        AND type = ANY ($1)
        AND process_at <= NOW()
        ORDER BY process_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [Object.keys(this.taskConfig)]
    )

    const task = taskQueryResult.rows[0]

    if (!task) {
      await client.query("COMMIT")
      client.release()
      return 0
    }

    try {
      await this.taskConfig[task.type].processor(task)

      const updateResult = await client.query(
        ` UPDATE ${DEFAULT_TASK_TABLE}
          SET
            completed_at = NOW(),
            state = 'completed'
          WHERE id = $1
          RETURNING *`,
        [task.id]
      )
      await client.query("COMMIT")

      this.events.emit("task.completed", updateResult.rows[0])
    } catch (e) {
      const updateResult = await client.query(
        ` UPDATE ${DEFAULT_TASK_TABLE}
          SET state = 'failed'
          WHERE id = $1
          RETURNING *`,
        [task.id]
      )
      await client.query("COMMIT")

      this.events.emit("task.failed", updateResult.rows[0], e)
    }

    client.release()
    return 1
  }

  async start(): Promise<void> {
    this.isRunning = true

    while (this.isRunning) {
      const result = await this.work()

      if (result === 0) {
        await new Promise((resolve) => {
          setTimeout(resolve, 2000)
        })
      }
    }
  }

  stop(): void {
    this.isRunning = false
  }
}

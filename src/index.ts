import { Pool, PoolClient, PoolConfig } from "pg";
import { EventEmitter } from "events";
import { migrate } from "./migrate";

interface TaskConfig {
  [taskName: string]: { processor: TaskProcessor; options: TaskProcessorOpts };
}

interface TaskProcessor {
  ({ id, data }: { id: number; data: any }): Promise<void> | void;
}

interface TaskProcessorOpts {
  retryDelay?: (failCount: number) => Promise<number> | number;
  retryLimit?: number;
}

export const DEFAULT_TASK_TABLE = "apoq_tasks";
const DEFAULT_CONCURRENCY = 4;

export class Apoq {
  private pool: Pool;
  private taskConfig: TaskConfig = {};
  private isRunning = false;
  events: EventEmitter = new EventEmitter();

  constructor(connectionConfig: PoolConfig | string) {
    let poolConfig: PoolConfig;
    if (typeof connectionConfig === "string") {
      poolConfig = { connectionString: connectionConfig };
    } else {
      poolConfig = { ...connectionConfig };
    }

    this.pool = new Pool({ ...poolConfig, application_name: "apoq" });
  }

  async prepare(): Promise<void> {
    await migrate(this.pool, { taskTable: DEFAULT_TASK_TABLE });
  }

  async add(
    type: string,
    data: unknown,
    { client = this.pool }: { client?: Pool | PoolClient } = {},
  ): Promise<{ id: string }> {
    const insertResult = await client.query(
      ` INSERT INTO ${DEFAULT_TASK_TABLE} (type, data)
        VALUES ($1, $2)
        RETURNING *`,
      [type, data],
    );

    return { id: insertResult.rows[0].id };
  }

  use(
    type: string,
    processor: TaskProcessor,
    options: TaskProcessorOpts = {},
  ): void {
    const processorOptions = {
      retryLimit: 5,
      retryDelay: (failCount) =>
        Math.floor(Math.random() * Math.pow(2, Math.min(failCount, 7)) + 1),
      ...options,
    };

    this.taskConfig[type] = { processor, options: processorOptions };
  }

  async work() {
    const client = await this.pool.connect();

    await client.query("BEGIN");
    const taskQueryResult = await client.query(
      ` SELECT *
        FROM ${DEFAULT_TASK_TABLE}
        WHERE state = 'pending'
        AND type = ANY ($1)
        AND process_at <= NOW()
        ORDER BY process_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
      [Object.keys(this.taskConfig)],
    );

    const task = taskQueryResult.rows[0];

    if (!task) {
      await client.query("COMMIT");
      client.release();
      return 0;
    }

    const config = this.taskConfig[task.type];

    try {
      await config.processor(task);

      const updateResult = await client.query(
        ` UPDATE ${DEFAULT_TASK_TABLE}
          SET
            completed_at = NOW(),
            state = 'completed'
          WHERE id = $1
          RETURNING *`,
        [task.id],
      );
      await client.query("COMMIT");

      this.events.emit("task.completed", updateResult.rows[0]);
    } catch (e) {
      const failResult = await this.failTask(task, config.options, client);

      await client.query("COMMIT");

      this.events.emit("task.failed", failResult.rows[0], e);
    } finally {
      client.release();
    }

    return 1;
  }

  private async failTask(
    task,
    options: TaskProcessorOpts,
    client: PoolClient,
  ): Promise<any> {
    const failCount = task.fail_count + 1;

    if (failCount > options.retryLimit) {
      const updateResult = await client.query(
        ` UPDATE ${DEFAULT_TASK_TABLE}
          SET state = 'failed',
              fail_count = $1
          WHERE id = $2
          RETURNING *`,
        [failCount, task.id],
      );
      return updateResult;
    }

    const retryDelay = (await options.retryDelay(failCount)) || 0;

    const updateResult = await client.query(
      ` UPDATE ${DEFAULT_TASK_TABLE}
        SET process_at = NOW() + $1 * INTERVAL '1',
            fail_count = $2
        WHERE id = $3
        RETURNING *`,
      [retryDelay, failCount, task.id],
    );

    return updateResult;
  }

  async start({
    concurrency = DEFAULT_CONCURRENCY,
  }: {
    concurrency?: number;
  } = {}): Promise<void> {
    this.isRunning = true;

    await Promise.all(
      Array(concurrency)
        .fill(null)
        .map(async () => {
          while (this.isRunning) {
            const result = await this.work();

            if (result === 0) {
              await new Promise((resolve) => {
                setTimeout(resolve, 2000);
              });
            }
          }
        }),
    );
  }

  async stop(): Promise<void> {
    this.isRunning = false;
    await this.pool.end();
  }
}

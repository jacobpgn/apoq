import { Pool } from "pg"

import { Apoq, DEFAULT_TASK_TABLE } from "../"

const TEST_CONNECTION_STRING =
  process.env.TEST_CONNECTION_STRING || "postgres://localhost/apoq_test"

const PG_POOL = new Pool({
  connectionString: TEST_CONNECTION_STRING,
  application_name: "apoq_test",
})

export const pgPool = () => PG_POOL

export const withApoq = async (fn: (apoq: Apoq) => Promise<any> | void) => {
  const apoqInstance = new Apoq(TEST_CONNECTION_STRING)
  const result = await fn(apoqInstance)
  await apoqInstance.stop()
  return result
}

export const clearDatabase = async (): Promise<void> => {
  await pgPool().query(`TRUNCATE TABLE ${DEFAULT_TASK_TABLE} CASCADE`)
}

beforeAll(async () => {
  await withApoq((apoq) => apoq.prepare())
})

afterAll(async () => {
  await clearDatabase()
  await PG_POOL.end()
})

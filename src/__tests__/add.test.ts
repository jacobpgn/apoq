import { withApoq, pgPool, clearDatabase } from "./helpers"

describe("add", () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it("enqueues a task", async () => {
    const initialTaskCount = await pgPool().query(
      `SELECT * FROM apoq_tasks WHERE type = 'addTaskTest';`
    )
    expect(initialTaskCount.rows.length).toBe(0)

    const result = await withApoq((apoq) =>
      apoq.add("addTaskTest", { hello: "world" })
    )

    expect(result).toMatchObject({ id: expect.any(String) })

    const newTask = await pgPool().query(
      `SELECT * FROM apoq_tasks WHERE id = $1;`,
      [result.id]
    )
    expect(newTask.rows[0]).toMatchObject({
      type: "addTaskTest",
      id: result.id,
      data: { hello: "world" },
      state: "pending",
    })
  })
})

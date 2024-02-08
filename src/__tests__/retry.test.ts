import { withApoq, pgPool, clearDatabase } from "./helpers";

const failTask = (taskProcessor, processorOptions = null) =>
  withApoq(async (apoq) => {
    apoq.use("retryTaskTest", taskProcessor, processorOptions);

    const task = await apoq.add("retryTaskTest", { foo: 123 });
    await apoq.work();

    const result = await pgPool().query(
      `SELECT * FROM apoq_tasks WHERE id = $1;`,
      [task.id],
    );

    return result.rows[0];
  });

describe("retry", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe("when a task fails with default behaviour", () => {
    let updatedTask;
    let taskProcessor = jest.fn();

    beforeAll(async () => {
      taskProcessor.mockRejectedValueOnce(new Error("oh no!"));

      updatedTask = await failTask(taskProcessor);
    });

    it("records the failure and leaves the task pending for retry", () => {
      expect(updatedTask).toMatchObject({
        state: "pending",
        fail_count: 1,
      });
    });

    it("schedules the retry", () => {
      const processAtSecondsFromNow =
        (updatedTask.process_at - new Date().getTime()) / 1000;

      // allow for some deviation from ~1s, as the time is set in Postgres
      expect(processAtSecondsFromNow).toBeGreaterThan(-2);
      expect(processAtSecondsFromNow).toBeLessThan(3);
    });
  });

  describe("when a task exhausts its retries", () => {
    let updatedTask;
    let taskProcessor = jest.fn();

    beforeAll(async () => {
      taskProcessor.mockRejectedValueOnce(new Error("oh no!"));

      updatedTask = await withApoq(async (apoq) => {
        apoq.use("retryTaskTest", taskProcessor);

        const task = await apoq.add("retryTaskTest", { nearly: "failed" });
        await pgPool().query(
          `UPDATE apoq_tasks set fail_count = 5 WHERE id = $1;`,
          [task.id],
        );
        await apoq.work();

        const result = await pgPool().query(
          `SELECT * FROM apoq_tasks WHERE id = $1;`,
          [task.id],
        );

        return result.rows[0];
      });
    });

    it("fails the task", () => {
      expect(updatedTask).toMatchObject({
        state: "failed",
        fail_count: 6,
      });
    });
  });

  describe("when a task fails with a custom retry behaviour", () => {
    let updatedTask;
    let taskProcessor = jest.fn();

    beforeAll(async () => {
      taskProcessor.mockRejectedValueOnce(new Error("oh no!"));

      updatedTask = await failTask(taskProcessor, {
        retryDelay: (failCount) => failCount * 60,
      });
    });

    it("records the failure and leaves the task pending for retry", () => {
      expect(updatedTask).toMatchObject({
        state: "pending",
        fail_count: 1,
      });
    });

    it("schedules the retry", () => {
      const processAtSecondsFromNow =
        (updatedTask.process_at - new Date().getTime()) / 1000;

      // allow for some deviation from 60s, as the time is set in Postgres
      expect(processAtSecondsFromNow).toBeGreaterThan(55);
      expect(processAtSecondsFromNow).toBeLessThan(65);
    });
  });

  describe("when a task processor doesn't want retries", () => {
    let updatedTask;
    let taskProcessor = jest.fn();

    beforeAll(async () => {
      taskProcessor.mockRejectedValueOnce(new Error("oh no!"));

      updatedTask = await failTask(taskProcessor, {
        retryLimit: 0,
      });
    });

    it("doesn't schedule the task for a retry", () => {
      expect(updatedTask).toMatchObject({
        state: "failed",
        fail_count: 1,
      });
    });
  });
});

import { withApoq, clearDatabase } from "./helpers";

describe("work", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  describe("with no tasks queued or configured", () => {
    let result;

    beforeAll(async () => {
      result = await withApoq((apoq) => apoq.work());
    });

    it("does nothing", () => {
      expect(result).toBe(0);
    });
  });

  describe("with tasks queued but not configured", () => {
    let result;

    beforeAll(async () => {
      result = await withApoq(async (apoq) => {
        await apoq.add("workTaskTest", { foo: 123 });
        return apoq.work();
      });
    });

    it("does nothing", () => {
      expect(result).toBe(0);
    });
  });

  describe("with tasks configured but none queued", () => {
    let result;

    beforeAll(async () => {
      result = await withApoq(async (apoq) => {
        apoq.use("workTaskTest", () => {
          throw new Error("task ran!");
        });

        return apoq.work();
      });
    });

    it("does nothing", () => {
      expect(result).toBe(0);
    });
  });

  describe("with a task configured and queued", () => {
    let result;
    let taskProcessor = jest.fn();

    beforeAll(async () => {
      result = await withApoq(async (apoq) => {
        apoq.use("workTaskTest", taskProcessor);
        await apoq.add("workTaskTest", { foo: 123 });

        return apoq.work();
      });
    });

    it("calls the configured task handler", async () => {
      expect(result).toEqual(1);

      expect(taskProcessor).toHaveBeenCalledTimes(1);
      expect(taskProcessor).toHaveBeenCalledWith(
        expect.objectContaining({ type: "workTaskTest", data: { foo: 123 } }),
      );
    });
  });

  describe("with multiple tasks configured and queued", () => {
    let result1, result2, result3, result4;

    let taskProcessorA = jest.fn();
    let taskProcessorB = jest.fn();

    beforeAll(async () => {
      await withApoq(async (apoq) => {
        apoq.use("workTaskTestA", taskProcessorA);
        apoq.use("workTaskTestB", taskProcessorB);

        await apoq.add("workTaskTestA", { foo: 123 });
        await apoq.add("workTaskTestB", { foo: 456 });
        await apoq.add("workTaskTestA", { foo: 789 });

        result1 = await apoq.work();
        result2 = await apoq.work();
        result3 = await apoq.work();
        result4 = await apoq.work();
      });
    });

    it("calls the task processors the right number of times", () => {
      expect(taskProcessorA).toHaveBeenCalledTimes(2);
      expect(taskProcessorB).toHaveBeenCalledTimes(1);
    });

    it("calls the configured task processor for the first task", () => {
      expect(result1).toEqual(1);

      expect(taskProcessorA).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: "workTaskTestA", data: { foo: 123 } }),
      );
    });

    it("calls the configured task processor for the second task", () => {
      expect(result2).toEqual(1);

      expect(taskProcessorB).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ type: "workTaskTestB", data: { foo: 456 } }),
      );
    });

    it("calls the configured task processor for the third task", () => {
      expect(result3).toEqual(1);

      expect(taskProcessorA).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ type: "workTaskTestA", data: { foo: 789 } }),
      );
    });

    it("finds no tasks on the fourth attempts", () => {
      expect(result4).toEqual(0);
    });
  });
});

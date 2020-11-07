module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  maxWorkers: 1,
  testPathIgnorePatterns: ["<rootDir>/src/__tests__/helpers.ts"],
  setupFilesAfterEnv: ["<rootDir>/src/__tests__/helpers.ts"],
}

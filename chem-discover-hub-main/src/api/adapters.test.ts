import { describe, expect, it } from "vitest";
import { toProgram } from "./adapters";

describe("toProgram", () => {
  it("maps camelCase API responses from backend-node", () => {
    const p = toProgram({
      id: "a",
      name: "Prog",
      diseaseArea: "Oncology",
      status: "draft",
      ownerId: "user-1",
      description: "x",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-06-01T00:00:00.000Z",
    });
    expect(p.diseaseArea).toBe("Oncology");
    expect(p.updatedAt).toBe("2024-06-01T00:00:00.000Z");
    expect(p.createdAt).toBe("2024-01-01T00:00:00.000Z");
  });

  it("still maps snake_case", () => {
    const p = toProgram({
      id: "b",
      name: "P2",
      disease_area: "Flu",
      status: "approved",
      owner_id: null,
      description: null,
      created_at: "2024-01-02T00:00:00.000Z",
      updated_at: "2024-01-03T00:00:00.000Z",
    });
    expect(p.diseaseArea).toBe("Flu");
    expect(p.updatedAt).toBe("2024-01-03T00:00:00.000Z");
  });
});

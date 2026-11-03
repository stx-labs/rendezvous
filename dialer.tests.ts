import { join } from "node:path";

import { DialerRegistry } from "./dialer";
import type { DialerContext } from "./dialer.types";

const dialPath = join("example", "dialer.ts");

describe("DialerRegistry interaction", () => {
  it("initializes the dialer registry with the dialer file", async () => {
    // Act
    const actual = new DialerRegistry(dialPath);

    // Assert
    expect(actual).toBeInstanceOf(DialerRegistry);
  });

  it("correctly executes registered pre-dialer", async () => {
    // Arrange
    const mockPreDialer = vi.fn();
    const registry = new DialerRegistry(dialPath);
    registry.registerPreDialer(mockPreDialer);

    // Act
    await registry.executePreDialers({} as any as DialerContext);

    // Assert
    expect(mockPreDialer).toHaveBeenCalledTimes(1);
  });

  it("correctly executes registered post-dialer", async () => {
    // Arrange
    const mockPostDialer = vi.fn();
    const registry = new DialerRegistry(dialPath);
    registry.registerPostDialer(mockPostDialer);

    // Act
    await registry.executePostDialers({} as any as DialerContext);

    // Assert
    expect(mockPostDialer).toHaveBeenCalledTimes(1);
  });

  it("all the pre-dialers are executed", async () => {
    // Arrange
    const mockPreDialer1 = vi.fn();
    const mockPreDialer2 = vi.fn();
    const registry = new DialerRegistry(dialPath);

    registry.registerPreDialer(mockPreDialer1);
    registry.registerPreDialer(mockPreDialer2);

    // Act
    await registry.executePreDialers({} as any as DialerContext);

    // Assert
    expect(mockPreDialer1).toHaveBeenCalledTimes(1);
    expect(mockPreDialer2).toHaveBeenCalledTimes(1);
  });

  it("all the post-dialers are executed", async () => {
    // Arrange
    const mockPostDialer1 = vi.fn();
    const mockPostDialer2 = vi.fn();
    const registry = new DialerRegistry(dialPath);

    registry.registerPostDialer(mockPostDialer1);
    registry.registerPostDialer(mockPostDialer2);

    // Act
    await registry.executePostDialers({} as any as DialerContext);

    // Assert
    expect(mockPostDialer1).toHaveBeenCalledTimes(1);
    expect(mockPostDialer2).toHaveBeenCalledTimes(1);
  });

  it("early exits when specified dialer file is not found", async () => {
    // Arrange
    vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit was called");
    });
    const registry = new DialerRegistry("non-existent.js");

    // Act & Assert
    await expect(registry.registerDialers()).rejects.toThrow(
      "process.exit was called",
    );
  });
});

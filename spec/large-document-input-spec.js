const { TextBuffer, Range } = require("lumine");
const { MAX_STRING_LENGTH } = require("node:buffer").constants;

describe("bounded snippet input", () => {
  let input, Expansion;
  beforeEach(() => {
    input = require("../lib/text-input");
    Expansion = require("../lib/snippet-expansion");
  });

  it("does not read a primary placeholder when there are no transformations", () => {
    const primary = {},
      mirror = { isTransformation: () => false };
    const read = jasmine.createSpy("getTextInBufferRange").and.throwError("unused read");
    const expansion = {
      insertionsByIndex: [[primary, mirror]],
      editor: { getTextInBufferRange: read },
    };
    expect(() => Expansion.prototype.applyTransformations.call(expansion, 0)).not.toThrow();
    expect(read).not.toHaveBeenCalled();
  });

  it("rejects impossible string inputs before reading the selected range", () => {
    const range = new Range([0, 0], [0, MAX_STRING_LENGTH + 1]);
    const read = jasmine.createSpy("read");
    const editor = {
      getTextInBufferRange: read,
      getBuffer: () => ({
        clipRange: () => range,
        characterIndexForPosition: (point) => point.column,
      }),
    };
    expect(() => input.readRange(editor, range)).toThrowError(/JavaScript string limit/);
    expect(read).not.toHaveBeenCalled();
  });

  it("reads indentation in bounded slices and checks source-backed changes", () => {
    const buffer = new TextBuffer({ text: " \t" + "x".repeat(100_000) });
    try {
      spyOn(buffer, "lineForRow").and.throwError("unbounded line");
      expect(input.indentation({ getBuffer: () => buffer }, 0)).toBe(" \t");
      const change = {
        oldTextSource: buffer.getTextSnapshot().subtext(0, 2),
        get oldText() {
          throw new Error("flattened change");
        },
      };
      expect(input.isIndentation(change, "oldText")).toBeTrue();
    } finally {
      buffer.destroy();
    }
  });
});

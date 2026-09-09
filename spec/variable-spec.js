const Variable = require("../lib/variable");
const { Point } = require("lumine");
const fs = require("fs");
const path = require("path");
const temp = require("@lumine-code/temp").track();

describe("Variable", () => {
  let fakeCursor = {
    getCurrentWordBufferRange() {
      return true;
    },
    getBufferRow() {
      return 9;
    },
  };

  let fakeSelectionRange = {
    isEmpty: () => false,
  };

  let fakeEditor = {
    getTitle() {
      return "foo.rb";
    },
    getPath() {
      return "/Users/lumine/code/foo.rb";
    },
    getTextInBufferRange(x) {
      return x === true ? "word" : "this text is selected";
    },
    lineTextForBufferRow() {
      return `this may be considered an entire line for the purposes of variable tests`;
    },
  };

  let fakeParams = { editor: fakeEditor, cursor: fakeCursor, selectionRange: fakeSelectionRange };

  it("resolves to the right value", () => {
    const expected = {
      TM_FILENAME: "foo.rb",
      TM_FILENAME_BASE: "foo",
      TM_CURRENT_LINE: `this may be considered an entire line for the purposes of variable tests`,
      TM_CURRENT_WORD: "word",
      TM_LINE_INDEX: "9",
      TM_LINE_NUMBER: "10",
      TM_DIRECTORY: "/Users/lumine/code",
      TM_SELECTED_TEXT: "this text is selected",
    };

    for (let variable in expected) {
      let vrbl = new Variable({ variable });
      expect(vrbl.resolve(fakeParams)).toEqual(expected[variable]);
    }
  });

  it("transforms", () => {
    let vrbl = new Variable({
      variable: "TM_FILENAME",
      substitution: {
        find: /(?:^|_)([A-Za-z0-9]+)(?:\.rb)?/g,
        replace: [{ escape: "u" }, { backreference: 1 }],
      },
      point: new Point(0, 0),
      snippet: {},
    });

    expect(vrbl.resolve({ editor: fakeEditor })).toEqual("Foo");
  });

  describe("workspace paths", () => {
    let root, realDirectory, aliasDirectory, filePath;

    const resolve = (name, currentPath = filePath) =>
      new Variable({ variable: name }).resolve({ editor: { getPath: () => currentPath } });

    beforeEach(() => {
      root = fs.realpathSync.native(temp.mkdirSync("snippets-workspace-variables"));
      realDirectory = path.join(root, "real-project");
      aliasDirectory = path.join(root, "project-alias");
      fs.mkdirSync(path.join(realDirectory, "child"), { recursive: true });
      filePath = path.join(realDirectory, "child", "file.js");
      fs.writeFileSync(filePath, "");
      fs.symlinkSync(
        realDirectory,
        aliasDirectory,
        process.platform === "win32" ? "junction" : "dir",
      );
      lumine.project.setPaths([aliasDirectory]);
    });

    afterEach(() => lumine.project.setPaths([]));

    it("resolves a real file through the registered project alias", () => {
      expect(resolve("WORKSPACE_NAME")).toBe("project-alias");
      expect(resolve("WORKSPACE_FOLDER")).toBe(aliasDirectory);
      expect(resolve("RELATIVE_FILEPATH")).toBe(path.join("child", "file.js"));
    });

    it("also resolves files opened through the project alias", () => {
      const aliasFile = path.join(aliasDirectory, "child", "file.js");
      expect(resolve("WORKSPACE_NAME", aliasFile)).toBe("project-alias");
      expect(resolve("WORKSPACE_FOLDER", aliasFile)).toBe(aliasDirectory);
      expect(resolve("RELATIVE_FILEPATH", aliasFile)).toBe(path.join("child", "file.js"));
    });

    it("uses the first containing project root", () => {
      lumine.project.setPaths([aliasDirectory, path.join(realDirectory, "child")]);
      expect(resolve("WORKSPACE_NAME")).toBe("project-alias");
      expect(resolve("WORKSPACE_FOLDER")).toBe(aliasDirectory);
      expect(resolve("RELATIVE_FILEPATH")).toBe(path.join("child", "file.js"));
    });

    it("keeps an outside file path and leaves workspace variables empty", () => {
      const outsideFile = path.join(root, "project-alias-other", "file.js");
      expect(resolve("WORKSPACE_NAME", outsideFile)).toBe("");
      expect(resolve("WORKSPACE_FOLDER", outsideFile)).toBe("");
      expect(resolve("RELATIVE_FILEPATH", outsideFile)).toBe(outsideFile);
    });

    it("leaves path variables empty for an untitled editor", () => {
      const editor = { getPath: () => undefined };
      for (const variable of ["WORKSPACE_NAME", "WORKSPACE_FOLDER", "RELATIVE_FILEPATH"]) {
        expect(new Variable({ variable }).resolve({ editor })).toBe("");
      }
    });
  });
});

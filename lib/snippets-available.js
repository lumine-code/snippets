const _ = require("@lumine-code/underscore-plus");
const { CompositeDisposable } = require("lumine");

module.exports = class SnippetsAvailable {
  constructor(snippets) {
    this.snippets = snippets;
    this.disposables = new CompositeDisposable();
    this.selectListView = lumine.workspace.buildSelectList({
      className: "available-snippets",
      crumb: "Snippets",
      panelItem: this,
      items: [],
      getItemId: (snippet) => snippet.id,
      search: { getFilterText: (snippet) => snippet.searchText },
      renderItem: (snippet) => ({
        primary: snippet.prefix,
        secondary: snippet.name,
      }),
      commands: {
        "snippets:insert-selected-snippet": {
          description: "Insert the selected snippet at every cursor.",
          didDispatch: (event) => this.insertSnippet(event.detail.item),
        },
        "snippets:close-empty-list": {
          description: "Close the list when no snippet matches.",
          didDispatch: () => {
            this.editor = null;
          },
        },
      },
      actions: [
        {
          command: "snippets:insert-selected-snippet",
          context: "item",
          primary: true,
          disposition: "close",
        },
        {
          command: "snippets:close-empty-list",
          context: "dialog",
          when: ({ item }) => item == null,
          primary: true,
          disposition: "close",
        },
      ],
    });
    this.disposables.add(
      this.selectListView.onDidCancel(() => {
        this.editor = null;
      }),
    );
    this.element = this.selectListView.getElement();
  }

  async toggle(editor) {
    this.editor = editor;
    if (this.selectListView.isVisible()) {
      this.cancel();
    } else {
      await this.populate();
      this.selectListView.show();
    }
  }

  cancel() {
    this.selectListView.cancel();
  }

  destroy() {
    this.disposables.dispose();
    return this.selectListView.destroy();
  }

  insertSnippet(snippet) {
    for (const cursor of this.editor.getCursors()) {
      this.snippets.insert(snippet.bodyText, this.editor, cursor);
    }
    this.editor = null;
  }

  populate() {
    const snippets = Object.values(this.snippets.getSnippets(this.editor));
    for (let snippet of snippets) {
      snippet.searchText = _.compact([snippet.prefix, snippet.name]).join(" ");
    }
    return this.selectListView.setItems(snippets);
  }
};

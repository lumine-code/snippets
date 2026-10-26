const { MAX_STRING_LENGTH } = require("node:buffer").constants;

function assertLength(length) {
  if (length <= MAX_STRING_LENGTH) return;
  const error = new RangeError("The snippet input exceeds the JavaScript string limit.");
  error.code = "ERR_SNIPPET_TEXT_TOO_LARGE";
  error.length = length;
  error.limit = MAX_STRING_LENGTH;
  throw error;
}

function readRange(editor, range) {
  const buffer = editor.getBuffer();
  range = buffer.clipRange(range);
  assertLength(
    buffer.characterIndexForPosition(range.end) - buffer.characterIndexForPosition(range.start),
  );
  return editor.getTextInBufferRange(range);
}

function indentation(editor, row) {
  const buffer = editor.getBuffer();
  const source = buffer.getTextSnapshot();
  const start = buffer.characterIndexForPosition([row, 0]);
  const end = start + buffer.lineLengthForRow(row);
  const pieces = [];
  let length = 0;
  for (let offset = start; offset < end; offset += 16384) {
    const chunk = source.slice(offset, Math.min(end, offset + 16384));
    const prefix = chunk.match(/^\s*/)[0];
    length += prefix.length;
    assertLength(length);
    pieces.push(prefix);
    if (prefix.length !== chunk.length) break;
  }
  return pieces.join("");
}

function isIndentation(change, name) {
  const source = change[`${name}Source`] ?? change[name];
  const chunks = typeof source === "string" ? [source] : source.chunks();
  for (const chunk of chunks) if (/[^\t ]/.test(chunk)) return false;
  return true;
}

module.exports = { readRange, indentation, isIndentation };

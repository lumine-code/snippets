// The snippet index maps arrays of independent paths in parallel. Keep the
// resulting catalogue in path order and preserve its synchronous empty case.
module.exports = function mapPaths(paths, read, callback) {
  const results = new Array(paths.length);
  if (paths.length === 0) return callback(null, results);
  let remaining = paths.length;
  let settled = false;
  for (let index = 0; index < paths.length; index++) {
    let called = false;
    read(paths[index], (error, result) => {
      if (called) throw new Error("Callback was already called.");
      called = true;
      if (settled) return;
      if (error) {
        settled = true;
        callback(error, results);
        return;
      }
      results[index] = result;
      if (--remaining === 0) {
        settled = true;
        callback(null, results);
      }
    });
  }
};

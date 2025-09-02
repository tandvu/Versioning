// CommonJS bootstrap for pkg bundling
// This file requires the compiled server entry. It ensures pkg can use CommonJS entrypoint.
try {
  require('./dist/index.js');
} catch (e) {
  // If running from source during development, require the src entry via ts-node/tsx
  try {
    require('./src/index.js');
  } catch (err) {
    console.error('Bootstrap failed to load server entry:', err);
    process.exit(1);
  }
}

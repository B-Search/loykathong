const { startServer } = require("./server.js");

startServer().catch((error) => {
  console.error("Could not start the application:", error.message);
  process.exitCode = 1;
});

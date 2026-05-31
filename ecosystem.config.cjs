module.exports = {
  apps: [
    {
      name: "e-note",
      script: "server.js",
      cwd: "/var/www/e-note",
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        DATA_DIR: "/var/www/e-note-data"
      }
    }
  ]
};

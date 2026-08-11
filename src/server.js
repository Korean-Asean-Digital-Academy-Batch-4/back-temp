const app = require('./app');
const env = require('./config/env');

app.listen(env.port, () => {
  console.log(`EduTrack backend berjalan di ${env.appBaseUrl} (${env.nodeEnv})`);
});

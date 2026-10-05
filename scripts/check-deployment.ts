import { configurationError, databaseConnection } from '../server/config';

const error = configurationError({
  hosted: true,
  password: process.env.APP_PASSWORD,
  secret: process.env.SESSION_SECRET,
  databaseUrl: databaseConnection(process.env),
});
if (error) {
  console.error(`Streakify deployment setup: ${error}`);
  process.exitCode = 1;
} else {
  console.log('Streakify deployment configuration is valid. Database connectivity is checked at sign-in.');
}

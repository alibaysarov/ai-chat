import { defineConfig } from 'prisma/config';
import { loadServerEnv } from './src/load-env';

loadServerEnv();

export default defineConfig({
  datasource: {
    url: process.env.DATABASE_URL!,
  },
});

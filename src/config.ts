import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 3000,
  databaseUrl: required("DATABASE_URL"),
  redisUrl: required("REDIS_URL"),
};

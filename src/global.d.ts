export declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DB_NAME: string;
      DB_USER: string;
      DB_PASSWORD: string;
      DB_HOST: string;
      OWNER_ID: string;
      GRYFFINDOR_ROLE_ID: string;
      SLYTHERIN_ROLE_ID: string;
      HUFFLEPUFF_ROLE_ID: string;
      RAVENCLAW_ROLE_ID: string;
      DISCORD_TOKEN: string;
      NODE_ENV: "development" | "production" | "test";
      EXCLUDE_VOICE_CHANNEL_IDS: string;
      CLIENT_ID: string;
      GUILD_ID: string;
    }
  }
}

import bolt, { LogLevel } from "@slack/bolt";
const { App } = bolt;
import OpenAI from "openai";

async function main() {
  const {
    OPENAI_API_KEY,
    SLACK_USER_ID,
    SLACK_OAUTH_BOT_TOKEN,
    SLACK_OAUTH_USER_TOKEN,
    SLACK_SIGNING_SECRET,
    SLACK_APP_TOKEN,
  } = process.env;
  if (typeof OPENAI_API_KEY !== "string") {
    throw new Error("OPENAI_API_KEY env var not set");
  }
  if (typeof SLACK_USER_ID !== "string") {
    throw new Error("SLACK_USER_ID env var not set");
  }
  if (typeof SLACK_OAUTH_BOT_TOKEN !== "string") {
    throw new Error("SLACK_OAUTH_BOT_TOKEN env var not set");
  }
  if (typeof SLACK_OAUTH_USER_TOKEN !== "string") {
    throw new Error("SLACK_OAUTH_USER_TOKEN env var not set");
  }
  if (typeof SLACK_SIGNING_SECRET !== "string") {
    throw new Error("SLACK_SIGNING_SECRET env var not set");
  }
  if (typeof SLACK_APP_TOKEN !== "string") {
    throw new Error("SLACK_APP_TOKEN env var not set");
  }

  const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
  });

  const app = new App({
    token: SLACK_OAUTH_BOT_TOKEN,
    signingSecret: SLACK_SIGNING_SECRET,
    socketMode: true,
    appToken: SLACK_APP_TOKEN,
    logLevel: LogLevel.DEBUG,
    port: 3000,
  });

  app.event("message", async ({ message, say, client }) => {
    const invalidMessage =
      "Sorry, I didn't understand that. Right now, the only command I understand is `summarize #channel`";

    if (message.subtype === undefined) {
      // Check authorization.
      if (message.user !== SLACK_USER_ID) {
        await say(
          "Sorry, this bot is in development right now, and doesn't support other users yet."
        );
        return;
      }

      // Parse command.
      const parse = message.text?.match(/summarize <#C(.*?)>/);
      if (!parse) {
        await say(invalidMessage);
        return;
      }

      // Parse channel ID.
      const channelMention = parse[1];
      const channelId = "C" + channelMention.split("|")[0];
      app.logger.debug("parsed summarize command", { channelId });

      // Get messages from channel.
      const history = await client.conversations.history({
        channel: channelId,
        token: SLACK_OAUTH_USER_TOKEN,
      });
      app.logger.debug("loaded channel messages", { history });

      // Summarize messages.
      const userCache = new Map<string, string>();
      for (const m of history.messages!) {
        if (m.user && !userCache.has(m.user)) {
          const user = await client.users.info({
            user: m.user,
            token: SLACK_OAUTH_USER_TOKEN,
          });
          userCache.set(m.user, user.user!.name!);
        }
      }
      const prompt = `Summarize these messages: ${history.messages?.map((m) => `@${userCache.get(m.user!)}: ${m.text}`).join("\n")}`;
      app.logger.debug("prompt", { prompt });
      const response = await openai.responses.create({
        model: "gpt-4o",
        input: prompt,
      });
      app.logger.debug("response", { response });

      // Send response.
      await say(response.output_text);
    } else {
      await say(invalidMessage);
      return;
    }
  });

  await app.start(3000);
  app.logger.info("App started");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

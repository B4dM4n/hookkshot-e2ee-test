import {
  Appservice,
  EncryptionAlgorithm,
  LogLevel,
  LogService,
  MessageEvent,
  RichConsoleLogger,
  RustSdkAppserviceCryptoStorageProvider,
  SimpleFsStorageProvider,
  SimpleRetryJoinStrategy,
} from "matrix-bot-sdk";

LogService.setLogger(new RichConsoleLogger());
LogService.setLevel(LogLevel.TRACE);
LogService.muteModule("Metrics");
LogService.trace = LogService.debug;

const appservice = new Appservice({
  bindAddress: "0.0.0.0",
  port: 9994,
  homeserverName: "local",
  homeserverUrl: "http://synapse:8008",

  storage: new SimpleFsStorageProvider("/data/encryption_appservice.json"),
  registration: {
    "as_token": "change_me",
    "hs_token": "change_me",
    "sender_localpart": "encbot",
    "namespaces": {
      users: [{
        regex: "@crypto_.*:local",
        exclusive: true,
      }],
      rooms: [],
      aliases: [],
    },
    "de.sorunome.msc2409.push_ephemeral": true,
  },
  joinStrategy: new SimpleRetryJoinStrategy(),
  cryptoStorage: new RustSdkAppserviceCryptoStorageProvider("/data/encryption"),

  intentOptions: {
    encryption: true,
  },
});
const bot = appservice.botIntent;

(async function () {
  await bot.enableEncryption();

  let privateRoomId: string;
  const joinedRooms = await bot.underlyingClient.getJoinedRooms();
  for (const roomId of joinedRooms) {
    if (await bot.underlyingClient.crypto.isRoomEncrypted(roomId)) {
      try {
        const roomName = (await bot.underlyingClient.getRoomStateEvent(roomId, "m.room.name", ""))?.["name"];
        if (roomName === "Encbot Private") {
          privateRoomId = roomId;
          break;
        }
      } catch (e) { }
    }
  }
  if (!privateRoomId) {
    privateRoomId = await bot.underlyingClient.createRoom({
      visibility: "private",
      preset: "private_chat",
      initial_state: [
        { type: "m.room.encryption", state_key: "", content: { algorithm: EncryptionAlgorithm.MegolmV1AesSha2 } },
        { type: "m.room.name", state_key: "", content: { name: "Encbot Private" } },
      ],
    });
  }

  appservice.on("room.invite", async (roomId: string, inviteEvent: any) => {
    LogService.info("index", `Received invite for ${inviteEvent["state_key"]} to ${roomId}`);
    await bot.joinRoom(roomId);
  });

  appservice.on("room.join", (roomId: string, joinEvent: any) => {
    LogService.info("index", `Joined ${roomId} as ${joinEvent["state_key"]}`);
  });

  appservice.on("room.failed_decryption", async (roomId: string, event: any, e: Error) => {
    LogService.error("index", `Failed to decrypt ${roomId} ${event['event_id']} because `, e);
  });

  appservice.on("room.message", async (roomId: string, event: any) => {
    const message = new MessageEvent(event);

    if (message.messageType !== "m.text") return;

    if (message.textBody.startsWith("!ping")) {
      await bot.underlyingClient.replyNotice(roomId, event, "Pong");
    } else if (message.textBody.startsWith("!invite")) {
      await bot.underlyingClient.inviteUser(message.sender, privateRoomId);
      await bot.underlyingClient.replyNotice(roomId, event, "Invited you into private room");
    }
  });

  LogService.info("index", "Starting appservice...");
  await appservice.begin();
})();

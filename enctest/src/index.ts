import * as fs from "fs";

import {
  Appservice,
  EncryptionAlgorithm,
  FileMessageEventContent,
  IAppserviceOptions,
  IAppserviceRegistration,
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

let creds = null;
try {
  creds = require("/data/encryption_appservice.creds.json");
} catch (e) {
  // ignore
}

const dmTarget = creds?.['dmTarget'] ?? "@admin:local";
const homeserverUrl = creds?.['homeserverUrl'] ?? "http://synapse:8008";
const storage = new SimpleFsStorageProvider("/data/encryption_appservice.json");
const crypto = new RustSdkAppserviceCryptoStorageProvider("/data/encryption");

const registration: IAppserviceRegistration = {
  "as_token": creds?.['asToken'] ?? "change_me",
  "hs_token": creds?.['hsToken'] ?? "change_me",
  "sender_localpart": "encbot",
  "namespaces": {
    users: [{
      regex: "@crypto.*:local",
      exclusive: true,
    }],
    rooms: [],
    aliases: [],
  },
  "de.sorunome.msc2409.push_ephemeral": true,
};

const options: IAppserviceOptions = {
  bindAddress: "0.0.0.0",
  port: 9994,
  homeserverName: "local",
  homeserverUrl: homeserverUrl,

  storage: storage,
  registration: registration,
  joinStrategy: new SimpleRetryJoinStrategy(),
  cryptoStorage: crypto,

  intentOptions: {
    encryption: true,
  },
};

const appservice = new Appservice(options);
const bot = appservice.botIntent;
// const bot = appservice.getIntentForUserId("@crypto_bot1:local");

(async function () {
  await bot.enableEncryption();

  let encryptedRoomId: string;
  const joinedRooms = await bot.underlyingClient.getJoinedRooms();
  for (const roomId of joinedRooms) {
    if (await bot.underlyingClient.crypto.isRoomEncrypted(roomId)) {
      const members = await bot.underlyingClient.getJoinedRoomMembers(roomId);
      if (members.length >= 2) {
        encryptedRoomId = roomId;
        break;
      }
    }
  }
  if (!encryptedRoomId) {
    encryptedRoomId = await bot.underlyingClient.createRoom({
      invite: [dmTarget],
      is_direct: true,
      visibility: "private",
      preset: "trusted_private_chat",
      initial_state: [
        { type: "m.room.encryption", state_key: "", content: { algorithm: EncryptionAlgorithm.MegolmV1AesSha2 } },
        { type: "m.room.guest_access", state_key: "", content: { guest_access: "can_join" } },
      ],
    });
  }

  appservice.on("room.failed_decryption", async (roomId: string, event: any, e: Error) => {
    LogService.error("index", `Failed to decrypt ${roomId} ${event['event_id']} because `, e);
  });

  appservice.on("room.message", async (roomId: string, event: any) => {
    if (roomId !== encryptedRoomId) return;

    const message = new MessageEvent(event);

    // if (message.sender === bot.userId && message.messageType === "m.notice") {
    //   // yay, we decrypted our own message. Communicate that back for testing purposes.
    //   await bot.underlyingClient.replyNotice(roomId, event, "it works");
    //   return;
    // }

    if (message.messageType !== "m.text") return;
    if (message.textBody.startsWith("!ping")) {
      await bot.underlyingClient.replyNotice(roomId, event, "Pong");
    }
  });

  LogService.info("index", "Starting appservice...");
  await appservice.begin();
})();

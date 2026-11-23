const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = process.env.GCP_PROJECT || "demo-no-project";
const ALICE_UID = "alice_brasilandia";
const BOB_UID = "bob_brasilandia";

const [emulatorHost, emulatorPortStr] = (
  process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085"
).split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

function validCreatePayload(uid, timestamp = new Date(Date.now() - 2000)) {
  return {
    userId: uid,
    playerName: "Dayvisson Silva",
    activeCharacterId: "ever",
    keysCollected: 25,
    enemiesDefeated: 5,
    mediumEnemiesCycle: 5,
    currentRealmIndex: 0,
    bossesDefeated: 0,
    satantiDowns: 0,
    keyTimerMaxSeconds: 30,
    finalWarActive: false,
    secretUnlocked: false,
    highScore: 1500,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user cannot read or write game saves", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    unauthDb.collection("users").doc(ALICE_UID).collection("game_saves").get()
  );
  await assertFails(
    unauthDb
      .collection("users")
      .doc(ALICE_UID)
      .collection("game_saves")
      .doc("primary")
      .set(validCreatePayload(ALICE_UID))
  );
});

test("Authenticated owner can create, read, list, and partially update own save", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const created = new Date(Date.now() - 10000);
  const saveRef = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("game_saves")
    .doc("primary");

  await assertSucceeds(saveRef.set(validCreatePayload(ALICE_UID, created)));
  await assertSucceeds(saveRef.get());
  await assertSucceeds(
    aliceDb.collection("users").doc(ALICE_UID).collection("game_saves").get()
  );

  await assertSucceeds(
    saveRef.update({
      keysCollected: 1000,
      secretUnlocked: true,
      activeCharacterId: "elo1000",
      currentRealmIndex: 3,
      satantiDowns: 2,
      keyTimerMaxSeconds: 50,
      finalWarActive: true,
      updatedAt: new Date(Date.now() - 1000),
    })
  );
});

test("Cross-user access is denied for get, list, create, update, and delete", async () => {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx
      .firestore()
      .collection("users")
      .doc(BOB_UID)
      .collection("game_saves")
      .doc("primary")
      .set(validCreatePayload(BOB_UID));
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const bobSaveRef = aliceDb
    .collection("users")
    .doc(BOB_UID)
    .collection("game_saves")
    .doc("primary");

  await assertFails(bobSaveRef.get());
  await assertFails(
    aliceDb.collection("users").doc(BOB_UID).collection("game_saves").get()
  );
  await assertFails(bobSaveRef.set(validCreatePayload(ALICE_UID)));
  await assertFails(
    bobSaveRef.update({
      keysCollected: 999,
      updatedAt: new Date(Date.now() - 1000),
    })
  );
  await assertFails(bobSaveRef.delete());
});

test("Rejects ghost fields, @DocumentId id field, invalid characterId, future timestamps, and immutable field mutation", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  const col = aliceDb
    .collection("users")
    .doc(ALICE_UID)
    .collection("game_saves");

  // Extra ghost field
  await assertFails(
    col.doc("bad1").set({
      ...validCreatePayload(ALICE_UID),
      isAdmin: true,
    })
  );

  // @DocumentId `id` key included in body
  await assertFails(
    col.doc("bad2").set({
      ...validCreatePayload(ALICE_UID),
      id: "bad2",
    })
  );

  // Invalid character ID
  await assertFails(
    col.doc("bad3").set({
      ...validCreatePayload(ALICE_UID),
      activeCharacterId: "hacker_char",
    })
  );

  // Future timestamp
  await assertFails(
    col.doc("bad4").set(validCreatePayload(ALICE_UID, new Date(Date.now() + 60000)))
  );

  // Valid create followed by attempt to mutate immutable createdAt & userId
  const saveRef = col.doc("primary");
  await assertSucceeds(saveRef.set(validCreatePayload(ALICE_UID)));
  await assertFails(
    saveRef.update({
      createdAt: new Date(Date.now() - 500),
      updatedAt: new Date(Date.now() - 500),
    })
  );
  await assertFails(
    saveRef.update({
      userId: BOB_UID,
      updatedAt: new Date(Date.now() - 500),
    })
  );
});

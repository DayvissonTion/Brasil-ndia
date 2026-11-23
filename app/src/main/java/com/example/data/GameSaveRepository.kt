package com.example.data

import android.content.Context
import com.example.R
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth
import com.google.firebase.firestore.DocumentSnapshot
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.snapshots
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.emitAll
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await

class GameSaveRepository(
  private val db: FirebaseFirestore,
  private val auth: FirebaseAuth = Firebase.auth,
) {
  constructor(context: Context) : this(
    FirebaseFirestore.getInstance(
      context.applicationContext.getString(R.string.firestore_database_id)
    )
  )

  private fun requireUserId(): String {
    return auth.currentUser?.uid
      ?: throw IllegalStateException("User must be signed in with Google before accessing Firestore.")
  }

  private fun saveDocRef(userId: String) =
    db.collection("users").document(userId).collection("game_saves").document(PRIMARY_SAVE_ID)

  fun observePrimarySave(userId: String): Flow<GameSave?> = flow {
    val uid = requireUserId()
    check(uid == userId) { "Signed-in user mismatch." }
    val docRef = saveDocRef(uid)
    emitAll(
      docRef
        .snapshots()
        .map { snapshot ->
          if (snapshot.exists()) {
            snapshot.toObject(
              GameSave::class.java,
              DocumentSnapshot.ServerTimestampBehavior.ESTIMATE,
            )
          } else {
            null
          }
        }
        .catch { error ->
          val firestoreError =
            generateSequence(error) { it.cause }
              .filterIsInstance<FirebaseFirestoreException>()
              .firstOrNull()
          if (firestoreError == null && error is CancellationException) throw error
          val exceptionToLog = firestoreError ?: (error as? Exception)
          if (exceptionToLog != null && auth.currentUser?.uid == uid) {
            handleFirestoreError(exceptionToLog, OperationType.GET, docRef.path)
          }
          throw error
        }
    )
  }

  suspend fun getPrimarySave(userId: String): Result<GameSave?> {
    var docPath = "users/$userId/game_saves/$PRIMARY_SAVE_ID"
    return try {
      val uid = requireUserId()
      check(uid == userId) { "Signed-in user mismatch." }
      val docRef = saveDocRef(uid)
      docPath = docRef.path
      val snapshot = docRef.get().await()
      val save =
        if (snapshot.exists()) {
          snapshot.toObject(
            GameSave::class.java,
            DocumentSnapshot.ServerTimestampBehavior.ESTIMATE,
          )
        } else {
          null
        }
      Result.success(save)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      handleFirestoreError(e, OperationType.GET, docPath)
      Result.failure(e)
    }
  }

  suspend fun upsertPrimarySave(userId: String, save: GameSave): Result<Unit> {
    var docPath = "users/$userId/game_saves/$PRIMARY_SAVE_ID"
    return try {
      val uid = requireUserId()
      check(uid == userId) { "Signed-in user changed; refusing cross-user write." }
      val docRef = saveDocRef(uid)
      docPath = docRef.path

      val sanitizedName = GameSave.sanitizePlayerName(save.playerName)
      val sanitizedChar = GameSave.sanitizeCharacterId(save.activeCharacterId)
      val keys = save.keysCollected.coerceIn(0L, 100_000L)
      val enemies = save.enemiesDefeated.coerceIn(0L, 1_000_000L)
      val cycle = save.mediumEnemiesCycle.coerceIn(0L, 20L)
      val realm = save.currentRealmIndex.coerceIn(0L, 3L)
      val bosses = save.bossesDefeated.coerceIn(0L, 100_000L)
      val satanti = save.satantiDowns.coerceIn(0L, 100_000L)
      val timerMax = save.keyTimerMaxSeconds.coerceIn(30L, 3600L)
      val highScore = save.highScore.coerceIn(0L, 100_000_000L)
      val secretUnlocked = save.secretUnlocked || keys >= 1000L

      val existing = docRef.get().await()
      if (existing.exists()) {
        docRef
          .update(
            mapOf(
              "playerName" to sanitizedName,
              "activeCharacterId" to sanitizedChar,
              "keysCollected" to keys,
              "enemiesDefeated" to enemies,
              "mediumEnemiesCycle" to cycle,
              "currentRealmIndex" to realm,
              "bossesDefeated" to bosses,
              "satantiDowns" to satanti,
              "keyTimerMaxSeconds" to timerMax,
              "finalWarActive" to save.finalWarActive,
              "secretUnlocked" to secretUnlocked,
              "highScore" to highScore,
              "updatedAt" to FieldValue.serverTimestamp(),
            )
          )
          .await()
      } else {
        docRef
          .set(
            mapOf(
              "userId" to uid,
              "playerName" to sanitizedName,
              "activeCharacterId" to sanitizedChar,
              "keysCollected" to keys,
              "enemiesDefeated" to enemies,
              "mediumEnemiesCycle" to cycle,
              "currentRealmIndex" to realm,
              "bossesDefeated" to bosses,
              "satantiDowns" to satanti,
              "keyTimerMaxSeconds" to timerMax,
              "finalWarActive" to save.finalWarActive,
              "secretUnlocked" to secretUnlocked,
              "highScore" to highScore,
              "createdAt" to FieldValue.serverTimestamp(),
              "updatedAt" to FieldValue.serverTimestamp(),
            )
          )
          .await()
      }
      Result.success(Unit)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      handleFirestoreError(e, OperationType.WRITE, docPath)
      Result.failure(e)
    }
  }

  companion object {
    const val PRIMARY_SAVE_ID = "primary"
  }
}

package com.example.data

import androidx.annotation.Keep
import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentId
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.ServerTimestamp
import org.json.JSONObject

@Keep
@IgnoreExtraProperties
data class GameSave(
  @DocumentId val id: String = "",
  val userId: String = "",
  val playerName: String = "Viajante",
  val activeCharacterId: String = "ever",
  val keysCollected: Long = 0L,
  val enemiesDefeated: Long = 0L,
  val mediumEnemiesCycle: Long = 0L,
  val currentRealmIndex: Long = 0L,
  val bossesDefeated: Long = 0L,
  val satantiDowns: Long = 0L,
  val keyTimerMaxSeconds: Long = 30L,
  val finalWarActive: Boolean = false,
  val secretUnlocked: Boolean = false,
  val highScore: Long = 0L,
  @ServerTimestamp val createdAt: Timestamp? = null,
  @ServerTimestamp val updatedAt: Timestamp? = null,
) {
  fun toJson(): JSONObject {
    return JSONObject().apply {
      put("playerName", playerName)
      put("activeCharacterId", activeCharacterId)
      put("keysCollected", keysCollected)
      put("enemiesDefeated", enemiesDefeated)
      put("mediumEnemiesCycle", mediumEnemiesCycle)
      put("currentRealmIndex", currentRealmIndex)
      put("bossesDefeated", bossesDefeated)
      put("satantiDowns", satantiDowns)
      put("keyTimerMaxSeconds", keyTimerMaxSeconds)
      put("finalWarActive", finalWarActive)
      put("secretUnlocked", secretUnlocked)
      put("highScore", highScore)
    }
  }

  companion object {
    val ALLOWED_CHARACTER_IDS =
      setOf(
        "ever",
        "silver",
        "anciao",
        "hamaya",
        "enbraim",
        "meyanga",
        "gakumelos",
        "guardiao",
        "elo1000",
      )

    fun sanitizeCharacterId(raw: String?): String {
      return if (raw != null && raw in ALLOWED_CHARACTER_IDS) raw else "ever"
    }

    fun sanitizePlayerName(raw: String?): String {
      val trimmed = (raw ?: "").trim()
      return if (trimmed.isEmpty()) "Viajante" else trimmed.take(60)
    }
  }
}

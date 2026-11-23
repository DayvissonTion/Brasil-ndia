package com.example.ui

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.data.GameSave
import com.example.data.GameSaveRepository
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import org.json.JSONObject

sealed interface UiState<out T> {
  data object Loading : UiState<Nothing>

  data class Success<T>(val data: T) : UiState<T>

  data class Error(val message: String) : UiState<Nothing>
}

enum class CloudSyncStatus {
  IDLE,
  SYNCING,
  SAVED,
  ERROR,
}

class GameViewModel(
  private val repository: GameSaveRepository,
  private val currentUserId: String,
  private val defaultPlayerName: String,
) : ViewModel() {

  val cloudSaveState: StateFlow<UiState<GameSave?>> =
    repository
      .observePrimarySave(currentUserId)
      .map<GameSave?, UiState<GameSave?>> { UiState.Success(it) }
      .catch { error ->
        val firestoreError =
          generateSequence(error) { it.cause }
            .filterIsInstance<FirebaseFirestoreException>()
            .firstOrNull()
        if (firestoreError == null && error is CancellationException) throw error
        val rootError = firestoreError ?: error
        Log.w(TAG, "Error observing cloud save", rootError)
        emit(UiState.Error(rootError.message ?: "Erro ao sincronizar nuvem"))
      }
      .stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(STOP_TIMEOUT_MILLIS),
        initialValue = UiState.Loading,
      )

  private val _syncStatus = MutableStateFlow(CloudSyncStatus.IDLE)
  val syncStatus: StateFlow<CloudSyncStatus> = _syncStatus.asStateFlow()

  private val _lastSyncError = MutableStateFlow<String?>(null)
  val lastSyncError: StateFlow<String?> = _lastSyncError.asStateFlow()

  fun saveProgressFromJson(jsonPayload: String) {
    viewModelScope.launch {
      _syncStatus.value = CloudSyncStatus.SYNCING
      _lastSyncError.value = null
      val parsed =
        try {
          val obj = JSONObject(jsonPayload)
          GameSave(
            userId = currentUserId,
            playerName =
              GameSave.sanitizePlayerName(obj.optString("playerName", defaultPlayerName)),
            activeCharacterId =
              GameSave.sanitizeCharacterId(obj.optString("activeCharacterId", "ever")),
            keysCollected = obj.optLong("keysCollected", 0L).coerceIn(0L, 100_000L),
            enemiesDefeated = obj.optLong("enemiesDefeated", 0L).coerceIn(0L, 1_000_000L),
            mediumEnemiesCycle = obj.optLong("mediumEnemiesCycle", 0L).coerceIn(0L, 20L),
            currentRealmIndex = obj.optLong("currentRealmIndex", 0L).coerceIn(0L, 3L),
            bossesDefeated = obj.optLong("bossesDefeated", 0L).coerceIn(0L, 100_000L),
            satantiDowns = obj.optLong("satantiDowns", 0L).coerceIn(0L, 100_000L),
            keyTimerMaxSeconds = obj.optLong("keyTimerMaxSeconds", 30L).coerceIn(30L, 3600L),
            finalWarActive = obj.optBoolean("finalWarActive", false),
            secretUnlocked = obj.optBoolean("secretUnlocked", false),
            highScore = obj.optLong("highScore", 0L).coerceIn(0L, 100_000_000L),
          )
        } catch (e: Exception) {
          Log.w(TAG, "Invalid cloud save JSON payload", e)
          _syncStatus.value = CloudSyncStatus.ERROR
          _lastSyncError.value = "Falha ao serializar progresso"
          return@launch
        }

      val result = repository.upsertPrimarySave(currentUserId, parsed)
      result.fold(
        onSuccess = {
          _syncStatus.value = CloudSyncStatus.SAVED
          _lastSyncError.value = null
        },
        onFailure = { error ->
          _syncStatus.value = CloudSyncStatus.ERROR
          _lastSyncError.value = error.localizedMessage ?: "Falha ao salvar na nuvem"
        },
      )
    }
  }

  private companion object {
    const val TAG = "GameViewModel"
    const val STOP_TIMEOUT_MILLIS = 5000L
  }
}

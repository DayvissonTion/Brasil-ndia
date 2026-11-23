package com.example.ui

import android.app.Activity
import android.content.Context
import android.util.Log
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.Key
import androidx.compose.material.icons.rounded.PlayArrow
import androidx.compose.material.icons.rounded.Shield
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import com.example.R
import com.example.ui.theme.CelestialBorder
import com.example.ui.theme.CelestialCard
import com.example.ui.theme.CelestialCyan
import com.example.ui.theme.CelestialEmerald
import com.example.ui.theme.CelestialGold
import com.example.ui.theme.CelestialNight
import com.example.ui.theme.CelestialVoid
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential.Companion.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
import com.google.firebase.Firebase
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext

fun attemptAutoSignIn(
  context: Context,
  credentialManager: CredentialManager,
  onAuthSuccess: () -> Unit,
  onUnauthenticated: () -> Unit,
  scope: CoroutineScope,
) {
  if (Firebase.auth.currentUser != null) {
    onAuthSuccess()
    return
  }
  val clientId =
    try {
      context.getString(R.string.default_web_client_id)
    } catch (_: Exception) {
      onUnauthenticated()
      return
    }
  val googleIdOption =
    GetGoogleIdOption.Builder()
      .setFilterByAuthorizedAccounts(true)
      .setServerClientId(clientId)
      .setAutoSelectEnabled(true)
      .build()
  val request = GetCredentialRequest.Builder().addCredentialOption(googleIdOption).build()
  scope.launch {
    try {
      val cred = credentialManager.getCredential(context, request).credential
      if (cred is CustomCredential && cred.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        val token = GoogleIdTokenCredential.createFrom(cred.data).idToken
        Firebase.auth.signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
        onAuthSuccess()
      } else {
        onUnauthenticated()
      }
    } catch (_: Exception) {
      onUnauthenticated()
    }
  }
}

fun onGoogleSignInClicked(
  context: Context,
  credentialManager: CredentialManager,
  onAuthSuccess: () -> Unit,
  onAuthError: (String) -> Unit,
  scope: CoroutineScope,
  onAuthCancelled: () -> Unit = {},
) {
  val clientId =
    try {
      context.getString(R.string.default_web_client_id)
    } catch (_: Exception) {
      onAuthError("Configuração de login ausente (default_web_client_id).")
      return
    }
  val signInOption = GetSignInWithGoogleOption.Builder(serverClientId = clientId).build()
  val request = GetCredentialRequest.Builder().addCredentialOption(signInOption).build()
  scope.launch {
    try {
      val activity = context as? Activity
      if (activity == null) {
        onAuthError("Contexto de Activity indisponível para autenticação.")
        return@launch
      }
      val cred = credentialManager.getCredential(activity, request).credential
      if (cred is CustomCredential && cred.type == TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
        val token = GoogleIdTokenCredential.createFrom(cred.data).idToken
        Firebase.auth.signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await()
        onAuthSuccess()
      } else {
        onAuthError("Tipo de credencial inesperado.")
      }
    } catch (e: GetCredentialCancellationException) {
      Log.w("Auth", "Google Sign-In cancelled or dismissed: ${e.message}", e)
      onAuthCancelled()
    } catch (e: Exception) {
      Log.e("Auth", "Google Sign-In failed", e)
      onAuthError(e.localizedMessage ?: "Falha ao autenticar com o Google.")
    }
  }
}

fun signOut(
  credentialManager: CredentialManager,
  scope: CoroutineScope,
  onSignOutComplete: () -> Unit = {},
) {
  scope.launch {
    withContext(NonCancellable) {
      try {
        credentialManager.clearCredentialState(ClearCredentialStateRequest())
      } catch (e: Exception) {
        Log.w("Auth", "Failed to clear credential state: ${e.message}")
      } finally {
        Firebase.auth.signOut()
        onSignOutComplete()
      }
    }
  }
}

@Composable
fun AuthScreen(
  onAuthSuccess: () -> Unit,
  onSkipForTest: () -> Unit,
) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val credentialManager = remember { CredentialManager.create(context) }

  var isCheckingAutoSignIn by remember { mutableStateOf(true) }
  var isSigningIn by remember { mutableStateOf(false) }
  var errorMessage by remember { mutableStateOf<String?>(null) }

  LaunchedEffect(Unit) {
    attemptAutoSignIn(
      context = context,
      credentialManager = credentialManager,
      onAuthSuccess = {
        isCheckingAutoSignIn = false
        onAuthSuccess()
      },
      onUnauthenticated = { isCheckingAutoSignIn = false },
      scope = scope,
    )
  }

  Box(
    modifier =
      Modifier.fillMaxSize()
        .background(
          Brush.verticalGradient(
            listOf(CelestialVoid, CelestialNight, Color(0xFF0A1A2F), CelestialVoid)
          )
        )
        .safeDrawingPadding(),
    contentAlignment = Alignment.Center,
  ) {
    Canvas(modifier = Modifier.fillMaxSize()) {
      drawCircle(
        brush =
          Brush.radialGradient(
            colors = listOf(CelestialGold.copy(alpha = 0.20f), Color.Transparent),
            center = Offset(size.width * 0.5f, size.height * 0.18f),
            radius = size.minDimension * 0.65f,
          ),
        radius = size.minDimension * 0.65f,
        center = Offset(size.width * 0.5f, size.height * 0.18f),
      )
      drawCircle(
        brush =
          Brush.radialGradient(
            colors = listOf(CelestialCyan.copy(alpha = 0.14f), Color.Transparent),
            center = Offset(size.width * 0.5f, size.height * 0.52f),
            radius = size.minDimension * 0.55f,
          ),
        radius = size.minDimension * 0.55f,
        center = Offset(size.width * 0.5f, size.height * 0.52f),
      )
    }

    Surface(
      modifier =
        Modifier.fillMaxWidth()
          .padding(horizontal = 24.dp, vertical = 16.dp)
          .widthIn(max = 460.dp)
          .border(1.dp, CelestialBorder, RoundedCornerShape(24.dp)),
      shape = RoundedCornerShape(24.dp),
      color = CelestialCard.copy(alpha = 0.92f),
      tonalElevation = 8.dp,
    ) {
      Column(
        modifier = Modifier.verticalScroll(rememberScrollState()).padding(28.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
      ) {
        Box(
          modifier =
            Modifier.size(68.dp)
              .clip(CircleShape)
              .background(
                Brush.linearGradient(
                  listOf(CelestialGold.copy(alpha = 0.25f), CelestialCyan.copy(alpha = 0.20f))
                )
              )
              .border(1.5.dp, CelestialGold.copy(alpha = 0.7f), CircleShape),
          contentAlignment = Alignment.Center,
        ) {
          Icon(
            imageVector = Icons.Rounded.Key,
            contentDescription = "Chave dos 1000 Elos",
            tint = CelestialGold,
            modifier = Modifier.size(34.dp),
          )
        }

        Text(
          text = "BRASILÂNDIA",
          style = MaterialTheme.typography.displaySmall,
          color = CelestialGold,
          textAlign = TextAlign.Center,
        )

        Text(
          text = "A Chave dos 1000 Elos",
          style = MaterialTheme.typography.headlineMedium,
          color = MaterialTheme.colorScheme.onBackground,
          textAlign = TextAlign.Center,
        )

        Text(
          text = "Obra autoral exclusiva de Dayvisson Silva",
          style = MaterialTheme.typography.bodyMedium,
          color = CelestialCyan,
          fontWeight = FontWeight.Medium,
          textAlign = TextAlign.Center,
        )

        Column(
          modifier =
            Modifier.fillMaxWidth()
              .clip(RoundedCornerShape(16.dp))
              .background(CelestialVoid.copy(alpha = 0.55f))
              .border(1.dp, CelestialBorder.copy(alpha = 0.7f), RoundedCornerShape(16.dp))
              .padding(14.dp),
          verticalArrangement = Arrangement.spacedBy(9.dp),
        ) {
          FeatureRow(
            icon = Icons.Rounded.AutoAwesome,
            tint = CelestialGold,
            text = "9 personagens com asas 3D articuladas e 4 planos dimensionais",
          )
          FeatureRow(
            icon = Icons.Rounded.Shield,
            tint = CelestialCyan,
            text = "Ponte Marechal Hermes (Pirapora - MG), Aura Divina e Guerra Final",
          )
          FeatureRow(
            icon = Icons.Rounded.CloudDone,
            tint = CelestialEmerald,
            text = "Conta Google/Gmail reconhecida automaticamente para salvar na nuvem",
          )
        }

        if (errorMessage != null) {
          Text(
            text = errorMessage ?: "",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.error,
            textAlign = TextAlign.Center,
          )
        }

        if (isCheckingAutoSignIn) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.padding(vertical = 8.dp),
          ) {
            CircularProgressIndicator(
              modifier = Modifier.size(22.dp),
              color = CelestialGold,
              strokeWidth = 2.5.dp,
            )
            Text(
              text = "Verificando conta Google automática...",
              style = MaterialTheme.typography.bodyMedium,
              color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
          }
        } else {
          Button(
            onClick = {
              errorMessage = null
              isSigningIn = true
              onGoogleSignInClicked(
                context = context,
                credentialManager = credentialManager,
                onAuthSuccess = {
                  isSigningIn = false
                  onAuthSuccess()
                },
                onAuthError = { msg ->
                  isSigningIn = false
                  errorMessage = msg
                },
                scope = scope,
                onAuthCancelled = {
                  isSigningIn = false
                  errorMessage =
                    "Login cancelado. Você pode escolher uma conta Google ou testar sem login."
                },
              )
            },
            enabled = !isSigningIn,
            modifier =
              Modifier.fillMaxWidth()
                .height(52.dp)
                .testTag("google_sign_in_button"),
            shape = RoundedCornerShape(14.dp),
            colors =
              ButtonDefaults.buttonColors(
                containerColor = CelestialGold,
                contentColor = CelestialVoid,
              ),
          ) {
            if (isSigningIn) {
              CircularProgressIndicator(
                modifier = Modifier.size(22.dp),
                color = CelestialVoid,
                strokeWidth = 2.5.dp,
              )
              Spacer(modifier = Modifier.width(10.dp))
              Text("Autenticando...", style = MaterialTheme.typography.labelLarge)
            } else {
              Text(
                text = "Entrar com Google (Salvar na Nuvem)",
                style = MaterialTheme.typography.labelLarge,
              )
            }
          }
        }

        OutlinedButton(
          onClick = onSkipForTest,
          enabled = !isSigningIn,
          modifier =
            Modifier.fillMaxWidth()
              .height(50.dp)
              .testTag("skip_login_button"),
          shape = RoundedCornerShape(14.dp),
          colors = ButtonDefaults.outlinedButtonColors(contentColor = CelestialCyan),
        ) {
          Icon(
            imageVector = Icons.Rounded.PlayArrow,
            contentDescription = null,
            modifier = Modifier.size(20.dp),
          )
          Spacer(modifier = Modifier.width(8.dp))
          Text(
            text = "Pular Login e Testar Agora",
            style = MaterialTheme.typography.labelLarge,
          )
        }

        Text(
          text =
            "No modo teste seu progresso fica salvo no aparelho. Você pode entrar ou criar sua conta Google quando quiser salvar na nuvem.",
          style = MaterialTheme.typography.bodyMedium,
          color = MaterialTheme.colorScheme.onSurfaceVariant,
          textAlign = TextAlign.Center,
        )
      }
    }
  }
}

@Composable
private fun FeatureRow(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  tint: Color,
  text: String,
) {
  Row(
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(10.dp),
  ) {
    Icon(
      imageVector = icon,
      contentDescription = null,
      tint = tint,
      modifier = Modifier.size(18.dp),
    )
    Text(
      text = text,
      style = MaterialTheme.typography.bodyMedium,
      color = MaterialTheme.colorScheme.onBackground,
    )
  }
}

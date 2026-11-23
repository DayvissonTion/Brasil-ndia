package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.credentials.CredentialManager
import androidx.lifecycle.ViewModelProvider.AndroidViewModelFactory.Companion.APPLICATION_KEY
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.example.data.GameSaveRepository
import com.example.ui.AuthScreen
import com.example.ui.GameViewModel
import com.example.ui.GameWebViewScreen
import com.example.ui.onGoogleSignInClicked
import com.example.ui.theme.BrasilandiaTheme
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.auth.auth

class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    enableEdgeToEdge()
    setContent { BrasilandiaTheme { AppNavigation() } }
  }
}

@Composable
fun AppNavigation(auth: FirebaseAuth = Firebase.auth) {
  val context = LocalContext.current
  val scope = rememberCoroutineScope()
  val credentialManager = remember { CredentialManager.create(context) }

  var currentUser by remember { mutableStateOf(auth.currentUser) }
  var skipLoginForTest by rememberSaveable { mutableStateOf(false) }
  var isSigningInFromGame by remember { mutableStateOf(false) }
  var authBannerError by remember { mutableStateOf<String?>(null) }

  DisposableEffect(auth) {
    val listener =
      FirebaseAuth.AuthStateListener { firebaseAuth ->
        val updated = firebaseAuth.currentUser
        currentUser = updated
        if (updated != null) {
          isSigningInFromGame = false
          authBannerError = null
        }
      }
    auth.addAuthStateListener(listener)
    onDispose { auth.removeAuthStateListener(listener) }
  }

  val user = currentUser
  if (user == null && !skipLoginForTest) {
    AuthScreen(
      onAuthSuccess = { currentUser = auth.currentUser },
      onSkipForTest = { skipLoginForTest = true },
    )
  } else if (user == null) {
    GameWebViewScreen(
      viewModel = null,
      isAuthenticated = false,
      playerName = "Visitante",
      isSigningInFromGame = isSigningInFromGame,
      authBannerError = authBannerError,
      onRequestGoogleSignIn = {
        authBannerError = null
        isSigningInFromGame = true
        onGoogleSignInClicked(
          context = context,
          credentialManager = credentialManager,
          onAuthSuccess = {
            isSigningInFromGame = false
            currentUser = auth.currentUser
          },
          onAuthError = { msg ->
            isSigningInFromGame = false
            authBannerError = msg
          },
          scope = scope,
          onAuthCancelled = {
            isSigningInFromGame = false
            authBannerError = "Login cancelado. Continuando no modo teste local."
          },
        )
      },
      onSignedOut = { skipLoginForTest = false },
    )
  } else {
    val uid = user.uid
    val displayName = user.displayName ?: user.email?.substringBefore("@") ?: "Viajante"
    key(uid) {
      val gameViewModel: GameViewModel =
        viewModel(
          key = uid,
          factory =
            viewModelFactory {
              initializer {
                val app =
                  checkNotNull(this[APPLICATION_KEY]) {
                    "APPLICATION_KEY missing from CreationExtras"
                  }
                val repo = GameSaveRepository(app)
                GameViewModel(
                  repository = repo,
                  currentUserId = uid,
                  defaultPlayerName = displayName,
                )
              }
            },
        )
      GameWebViewScreen(
        viewModel = gameViewModel,
        isAuthenticated = true,
        playerName = displayName,
        isSigningInFromGame = false,
        authBannerError = null,
        onRequestGoogleSignIn = {},
        onSignedOut = {
          skipLoginForTest = false
          currentUser = null
        },
      )
    }
  }
}

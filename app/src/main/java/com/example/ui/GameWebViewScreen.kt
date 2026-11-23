package com.example.ui

import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Logout
import androidx.compose.material.icons.rounded.CloudDone
import androidx.compose.material.icons.rounded.CloudOff
import androidx.compose.material.icons.rounded.CloudSync
import androidx.compose.material.icons.rounded.CloudUpload
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.credentials.CredentialManager
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.example.ui.theme.CelestialBorder
import com.example.ui.theme.CelestialCard
import com.example.ui.theme.CelestialCrimson
import com.example.ui.theme.CelestialCyan
import com.example.ui.theme.CelestialEmerald
import com.example.ui.theme.CelestialGold
import com.example.ui.theme.CelestialVoid
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.flow.MutableStateFlow
import org.json.JSONObject

private const val ASSET_HOST = "appassets.androidplatform.net"

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun GameWebViewScreen(
  viewModel: GameViewModel?,
  isAuthenticated: Boolean,
  playerName: String,
  isSigningInFromGame: Boolean,
  authBannerError: String?,
  onRequestGoogleSignIn: () -> Unit,
  onSignedOut: () -> Unit,
) {
  val context = LocalContext.current
  val lifecycleOwner = LocalLifecycleOwner.current
  val scope = rememberCoroutineScope()
  val credentialManager = remember { CredentialManager.create(context) }

  val emptyCloudFlow = remember { MutableStateFlow<UiState<com.example.data.GameSave?>>(UiState.Success(null)) }
  val emptySyncFlow = remember { MutableStateFlow(CloudSyncStatus.IDLE) }

  val cloudState by (viewModel?.cloudSaveState ?: emptyCloudFlow).collectAsState()
  val syncStatus by (viewModel?.syncStatus ?: emptySyncFlow).collectAsState()

  var webViewRef by remember { mutableStateOf<WebView?>(null) }
  var pageLoaded by remember { mutableStateOf(false) }

  val ttsRef = remember { mutableStateOf<TextToSpeech?>(null) }
  DisposableEffect(context) {
    var ttsInstance: TextToSpeech? = null
    ttsInstance =
      TextToSpeech(context.applicationContext) { status ->
        if (status == TextToSpeech.SUCCESS) {
          ttsInstance?.language = Locale.Builder().setLanguage("pt").setRegion("BR").build()
        }
      }
    ttsRef.value = ttsInstance
    onDispose {
      ttsInstance.stop()
      ttsInstance.shutdown()
      ttsRef.value = null
    }
  }

  val mainHandler = remember { Handler(Looper.getMainLooper()) }

  val latestCloudState by rememberUpdatedState(cloudState)
  val latestViewModel by rememberUpdatedState(viewModel)
  val latestAuthenticated by rememberUpdatedState(isAuthenticated)
  val latestPlayerName by rememberUpdatedState(playerName)
  val latestSignInCallback by rememberUpdatedState(onRequestGoogleSignIn)

  // Notify JS when auth status or cloud snapshot changes
  LaunchedEffect(pageLoaded, isAuthenticated, cloudState) {
    if (!pageLoaded) return@LaunchedEffect
    val view = webViewRef ?: return@LaunchedEffect
    view.evaluateJavascript(
      "window.onCloudAuthChanged && window.onCloudAuthChanged($isAuthenticated);",
      null,
    )
    if (!isAuthenticated) return@LaunchedEffect

    when (val state = cloudState) {
      is UiState.Success -> {
        val jsonStr =
          state.data?.toJson()?.toString()
            ?: JSONObject().apply { put("playerName", playerName) }.toString()
        val escaped = JSONObject.quote(jsonStr)
        view.evaluateJavascript(
          "window.onCloudSaveLoaded && window.onCloudSaveLoaded(JSON.parse($escaped));",
          null,
        )
      }
      is UiState.Error -> {
        val escaped = JSONObject.quote(state.message)
        view.evaluateJavascript(
          "window.onCloudSyncError && window.onCloudSyncError($escaped);",
          null,
        )
      }
      UiState.Loading -> Unit
    }
  }

  LaunchedEffect(pageLoaded, authBannerError) {
    if (!pageLoaded || authBannerError == null) return@LaunchedEffect
    val escaped = JSONObject.quote(authBannerError)
    webViewRef?.evaluateJavascript(
      "window.onCloudSyncError && window.onCloudSyncError($escaped);",
      null,
    )
  }

  BackHandler {
    val wv = webViewRef
    if (wv != null) {
      wv.evaluateJavascript("window.handleAndroidBack && window.handleAndroidBack();", null)
    }
  }

  DisposableEffect(lifecycleOwner) {
    val observer = LifecycleEventObserver { _, event ->
      when (event) {
        Lifecycle.Event.ON_PAUSE -> {
          webViewRef?.onPause()
          ttsRef.value?.stop()
        }
        Lifecycle.Event.ON_RESUME -> webViewRef?.onResume()
        Lifecycle.Event.ON_DESTROY -> {
          webViewRef?.destroy()
          webViewRef = null
        }
        else -> Unit
      }
    }
    lifecycleOwner.lifecycle.addObserver(observer)
    onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
  }

  Box(modifier = Modifier.fillMaxSize().background(CelestialVoid)) {
    AndroidView(
      modifier = Modifier.fillMaxSize(),
      factory = { ctx ->
        WebView(ctx).apply {
          layoutParams =
            ViewGroup.LayoutParams(
              ViewGroup.LayoutParams.MATCH_PARENT,
              ViewGroup.LayoutParams.MATCH_PARENT,
            )
          setLayerType(View.LAYER_TYPE_HARDWARE, null)
          setBackgroundColor(android.graphics.Color.parseColor("#070B19"))

          settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            useWideViewPort = true
            loadWithOverviewMode = false
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
          }

          addJavascriptInterface(
            BrasilandiaJsBridge(
              mainHandler = mainHandler,
              getViewModel = { latestViewModel },
              getIsAuthenticated = { latestAuthenticated },
              getPlayerName = { latestPlayerName },
              getCloudSave = { (latestCloudState as? UiState.Success)?.data },
              onRequestGoogleSignIn = { latestSignInCallback() },
              onShareWhatsApp = { message ->
                try {
                  val waIntent =
                    Intent(
                      Intent.ACTION_VIEW,
                      Uri.parse("https://wa.me/?text=" + Uri.encode(message)),
                    )
                  val chooser = Intent.createChooser(waIntent, "Compartilhar progresso no WhatsApp")
                  context.startActivity(chooser)
                } catch (_: Exception) {
                  val sendIntent =
                    Intent(Intent.ACTION_SEND).apply {
                      type = "text/plain"
                      putExtra(Intent.EXTRA_TEXT, message)
                    }
                  context.startActivity(Intent.createChooser(sendIntent, "Compartilhar progresso"))
                }
              },
              onSpeakPtBr = { text ->
                ttsRef.value?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "brasilandia_narration")
              },
              onStopSpeakPtBr = { ttsRef.value?.stop() },
            ),
            "AndroidBridge",
          )

          webChromeClient =
            object : WebChromeClient() {
              override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                consoleMessage?.let {
                  Log.d(
                    "BrasilandiaWebGL",
                    "[${it.messageLevel()}] ${it.message()} (${it.sourceId()}:${it.lineNumber()})",
                  )
                }
                return true
              }
            }

          webViewClient =
            object : WebViewClient() {
              override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?,
              ): WebResourceResponse? {
                val url = request?.url ?: return null
                if (url.host != ASSET_HOST) return null
                val rawPath = url.path?.removePrefix("/") ?: return null
                if (!rawPath.startsWith("assets/")) return null
                val assetPath = rawPath.removePrefix("assets/")
                return try {
                  val inputStream = ctx.assets.open(assetPath)
                  val mimeType =
                    when {
                      assetPath.endsWith(".html") -> "text/html"
                      assetPath.endsWith(".css") -> "text/css"
                      assetPath.endsWith(".js") || assetPath.endsWith(".mjs") ->
                        "application/javascript"
                      assetPath.endsWith(".json") -> "application/json"
                      assetPath.endsWith(".svg") -> "image/svg+xml"
                      assetPath.endsWith(".png") -> "image/png"
                      else -> "application/octet-stream"
                    }
                  WebResourceResponse(mimeType, "UTF-8", inputStream)
                } catch (e: IOException) {
                  Log.w("BrasilandiaAssets", "Missing asset: $assetPath", e)
                  null
                }
              }

              override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pageLoaded = true
              }
            }

          loadUrl("https://$ASSET_HOST/assets/game/index.html")
          webViewRef = this
        }
      },
    )

    // Top-right Cloud Status pill: when in Test Mode, allows instant Google Sign-In for Cloud Save!
    Surface(
      modifier =
        Modifier.align(Alignment.TopEnd)
          .safeDrawingPadding()
          .padding(top = 6.dp, end = 8.dp)
          .border(
            1.dp,
            if (isAuthenticated) CelestialBorder.copy(alpha = 0.7f) else CelestialGold.copy(alpha = 0.75f),
            RoundedCornerShape(20.dp),
          ),
      shape = RoundedCornerShape(20.dp),
      color = CelestialCard.copy(alpha = 0.86f),
    ) {
      if (!isAuthenticated) {
        Row(
          modifier =
            Modifier.defaultMinSize(minWidth = 48.dp, minHeight = 48.dp)
              .clickable(enabled = !isSigningInFromGame) { onRequestGoogleSignIn() }
              .padding(horizontal = 12.dp, vertical = 8.dp)
              .testTag("cloud_login_button"),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          if (isSigningInFromGame) {
            CircularProgressIndicator(
              modifier = Modifier.size(16.dp),
              color = CelestialGold,
              strokeWidth = 2.dp,
            )
            Text(
              text = "Conectando...",
              style = MaterialTheme.typography.bodyMedium,
              color = CelestialGold,
            )
          } else {
            Icon(
              imageVector = Icons.Rounded.CloudUpload,
              contentDescription = "Entrar com Google para salvar na nuvem",
              tint = CelestialGold,
              modifier = Modifier.size(16.dp),
            )
            Text(
              text = "Salvar na Nuvem",
              style = MaterialTheme.typography.bodyMedium,
              color = CelestialGold,
            )
          }
        }
      } else {
        Row(
          modifier = Modifier.padding(start = 10.dp, end = 4.dp, top = 2.dp, bottom = 2.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
          val (icon, tint, label) =
            when (syncStatus) {
              CloudSyncStatus.SYNCING ->
                Triple(Icons.Rounded.CloudSync, CelestialCyan, "Salvando...")
              CloudSyncStatus.SAVED ->
                Triple(Icons.Rounded.CloudDone, CelestialEmerald, "Nuvem OK")
              CloudSyncStatus.ERROR ->
                Triple(Icons.Rounded.CloudOff, CelestialCrimson, "Erro Nuvem")
              CloudSyncStatus.IDLE ->
                Triple(Icons.Rounded.CloudDone, CelestialGold, "Conectado")
            }
          Icon(
            imageVector = icon,
            contentDescription = label,
            tint = tint,
            modifier = Modifier.size(16.dp),
          )
          Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = tint,
          )
          IconButton(
            onClick = { signOut(credentialManager, scope, onSignOutComplete = onSignedOut) },
            modifier = Modifier.size(36.dp).testTag("sign_out_button"),
          ) {
            Icon(
              imageVector = Icons.AutoMirrored.Rounded.Logout,
              contentDescription = "Sair da conta Google",
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(18.dp),
            )
          }
        }
      }
    }
  }
}

private class BrasilandiaJsBridge(
  private val mainHandler: Handler,
  private val getViewModel: () -> GameViewModel?,
  private val getIsAuthenticated: () -> Boolean,
  private val getPlayerName: () -> String,
  private val getCloudSave: () -> com.example.data.GameSave?,
  private val onRequestGoogleSignIn: () -> Unit,
  private val onShareWhatsApp: (String) -> Unit,
  private val onSpeakPtBr: (String) -> Unit,
  private val onStopSpeakPtBr: () -> Unit,
) {
  @JavascriptInterface
  fun autoSaveCloud(jsonPayload: String) {
    val vm = getViewModel()
    if (getIsAuthenticated() && vm != null) {
      mainHandler.post { vm.saveProgressFromJson(jsonPayload) }
    }
  }

  @JavascriptInterface
  fun isCloudAuthenticated(): Boolean = getIsAuthenticated()

  @JavascriptInterface
  fun requestCloudLogin() {
    mainHandler.post { onRequestGoogleSignIn() }
  }

  @JavascriptInterface
  fun requestCloudState(): String {
    val current = getCloudSave()
    return if (getIsAuthenticated() && current != null) {
      current.toJson().toString()
    } else {
      JSONObject().apply { put("playerName", getPlayerName()) }.toString()
    }
  }

  @JavascriptInterface
  fun shareWhatsApp(message: String) {
    mainHandler.post { onShareWhatsApp(message) }
  }

  @JavascriptInterface
  fun speakPtBr(text: String) {
    mainHandler.post { onSpeakPtBr(text) }
  }

  @JavascriptInterface
  fun stopSpeakPtBr() {
    mainHandler.post { onStopSpeakPtBr() }
  }
}

package com.example.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable

private val BrasilandiaDarkColorScheme =
  darkColorScheme(
    primary = CelestialGold,
    onPrimary = CelestialVoid,
    secondary = CelestialCyan,
    onSecondary = CelestialVoid,
    tertiary = CelestialEmerald,
    onTertiary = CelestialVoid,
    background = CelestialVoid,
    onBackground = CelestialText,
    surface = CelestialNight,
    onSurface = CelestialText,
    surfaceVariant = CelestialCard,
    onSurfaceVariant = CelestialMuted,
    outline = CelestialBorder,
    error = CelestialCrimson,
    onError = CelestialText,
  )

@Composable
fun BrasilandiaTheme(content: @Composable () -> Unit) {
  MaterialTheme(
    colorScheme = BrasilandiaDarkColorScheme,
    typography = Typography,
    content = content,
  )
}

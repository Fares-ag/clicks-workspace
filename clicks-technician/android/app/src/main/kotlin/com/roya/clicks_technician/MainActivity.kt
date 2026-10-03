package com.roya.clicks_technician

import android.app.ActivityManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val mapsKeyChannel = "clicks_technician/maps_key"
    private val urgentAlarmChannel = "clicks_technician/urgent_alarm"
    private val deviceChannel = "clicks_technician/device"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger

        MethodChannel(messenger, mapsKeyChannel).setMethodCallHandler { call, result ->
            if (call.method == "getGoogleMapsApiKey") {
                result.success(readMapsApiKey())
            } else {
                result.notImplemented()
            }
        }

        MethodChannel(messenger, deviceChannel).setMethodCallHandler { call, result ->
            if (call.method == "getCapability") {
                result.success(readDeviceCapability())
            } else {
                result.notImplemented()
            }
        }

        MethodChannel(messenger, urgentAlarmChannel).setMethodCallHandler { call, result ->
            when (call.method) {
                "boostAlarmVolume" -> {
                    boostAlarmVolume()
                    result.success(null)
                }
                "isBatteryUnrestricted" -> {
                    result.success(isBatteryUnrestricted())
                }
                "requestBatteryUnrestricted" -> {
                    requestBatteryUnrestricted()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
    }

    /** RAM in MB plus ActivityManager.isLowRamDevice. Failures return a normal device. */
    private fun readDeviceCapability(): Map<String, Any> {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
            val info = ActivityManager.MemoryInfo()
            am.getMemoryInfo(info)
            val ramMb = (info.totalMem / (1024L * 1024L)).toInt()
            val lowRam = am.isLowRamDevice || (ramMb in 1..3584)
            mapOf("isLowEnd" to lowRam, "ramMb" to ramMb)
        } catch (_: Exception) {
            mapOf("isLowEnd" to false, "ramMb" to 0)
        }
    }

    private fun isBatteryUnrestricted(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return true
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        return pm.isIgnoringBatteryOptimizations(packageName)
    }

    /** One-tap system dialog — much easier than digging through Settings. */
    private fun requestBatteryUnrestricted() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (isBatteryUnrestricted()) return
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:$packageName")
            }
            startActivity(intent)
        } catch (_: Exception) {
            openAppDetailsSettings()
        }
    }

    private fun openAppDetailsSettings() {
        val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.fromParts("package", packageName, null)
        }
        startActivity(intent)
    }

    /** Route urgent job alert audio through the ALARM stream at full volume. */
    private fun boostAlarmVolume() {
        val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
        val max = audioManager.getStreamMaxVolume(AudioManager.STREAM_ALARM)
        audioManager.setStreamVolume(AudioManager.STREAM_ALARM, max, 0)
    }

    private fun readMapsApiKey(): String {
        return try {
            val ai = packageManager.getApplicationInfo(
                packageName,
                PackageManager.GET_META_DATA,
            )
            ai.metaData?.getString("com.google.android.geo.API_KEY") ?: ""
        } catch (_: Exception) {
            ""
        }
    }
}

package com.roya.clicks_technician

import android.content.pm.PackageManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private val mapsKeyChannel = "clicks_technician/maps_key"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, mapsKeyChannel)
            .setMethodCallHandler { call, result ->
                if (call.method == "getGoogleMapsApiKey") {
                    result.success(readMapsApiKey())
                } else {
                    result.notImplemented()
                }
            }
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
